import React, { useState } from "react";
import { RefreshCw, Pencil, AlertCircle, KeyRound, Clock } from "lucide-react";
import { vehicleBlockedByTimeOff, vehicleLabel, buildTitle, isToday, formatLongDate, formatDuration, technicianColor, areaKey, orderExpectedMinutes, STATUS_META, timeSlotText, weekDays } from "../data/domain";
import { getAiRouteSuggestion } from "../lib/dataStore";
import { DateSelector } from "../components/common";
import { OrderCardCompact } from "../components/OrderCardCompact";

const toMinutes = (hhmm) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm || "")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function DrivingRowHeader({ r, loadMinutes, vehicles, technicians, timeOff, selectedDate, onUpdateTechnician }) {
  const [editing, setEditing] = useState(false);
  const [vehicleId, setVehicleId] = useState(r.bilId || "");
  const linkedVehicle = vehicles.find((b) => b.id === r.bilId);
  const timeOffBlock = vehicleBlockedByTimeOff(r.bilId, selectedDate, technicians, timeOff);

  if (!r.id) {
    return <div className="min-w-0"><p className="text-xs font-semibold text-ink truncate">{r.navn}</p></div>;
  }

  const save = (newVehicleId) => { onUpdateTechnician(r.id, { bilId: newVehicleId || null }); setEditing(false); };

  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-ink truncate">{r.navn}</p>
      {editing ? (
        <select
          autoFocus
          value={vehicleId}
          onChange={(e) => { setVehicleId(e.target.value); save(e.target.value); }}
          onBlur={() => setEditing(false)}
          className="w-full min-w-0 rounded-md border border-line bg-white px-1 py-0.5 text-[10px] text-ink focus:outline-none focus:border-brand mt-0.5"
        >
          <option value="">Ingen bil</option>
          {vehicles.map((b) => (
            <option key={b.id} value={b.id} disabled={b.lukket && b.id !== r.bilId}>
              {vehicleLabel(b)}{b.lukket ? " (lukket)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <button onClick={() => { setVehicleId(r.bilId || ""); setEditing(true); }} className="flex items-center gap-1 text-[10px] text-muted hover:text-brand border-b border-dashed border-line hover:border-brand w-fit" title="Klik for at skifte bil">
          <span className="truncate">{linkedVehicle ? vehicleLabel(linkedVehicle) : "Ingen bil"}</span>
          <Pencil size={9} className="shrink-0" />
        </button>
      )}
      {loadMinutes > 0 && <p className="text-[10px] text-brand font-semibold flex items-center gap-1"><Clock size={9} /> {formatDuration(loadMinutes)} planlagt</p>}
      {linkedVehicle?.lukket && <p className="text-[10px] text-danger font-semibold flex items-center gap-1"><AlertCircle size={9} /> Bil lukket ({linkedVehicle.lukketAarsag || "værksted"})</p>}
      {!linkedVehicle?.lukket && timeOffBlock && <p className="text-[10px] text-danger font-semibold flex items-center gap-1"><AlertCircle size={9} /> {timeOffBlock.montor.navn} holder ferie</p>}
    </div>
  );
}

// ---------------- Ruteoptimering: ugens områdefordeling + AI-forslag ----------------

function WeeklyAreas({ orders, technicians, selectedDate }) {
  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const week = weekDays(selectedDate);
  const weekOrders = orders.filter((s) => week.includes(s.dato) && s.kunde?.adresse);

  const areas = {};
  weekOrders.forEach((s) => {
    const key = areaKey(s.kunde.adresse);
    if (!key) return;
    if (!areas[key]) areas[key] = {};
    if (!areas[key][s.dato]) areas[key][s.dato] = [];
    areas[key][s.dato].push(s);
  });
  const areaNames = Object.keys(areas).sort();
  const technicianName = (id) => technicians.find((m) => m.id === id)?.navn;

  const isProblem = (key) => {
    const doubleCovered = week.some((d) => new Set((areas[key]?.[d] || []).filter((s) => s.montorId).map((s) => s.montorId)).size > 1);
    const spread = week.filter((d) => (areas[key]?.[d] || []).length > 0).length >= 2;
    return doubleCovered || spread;
  };

  const askAI = async () => {
    setAiLoading(true); setAiError(null); setAiAnswer(null);
    const basis = weekOrders.map((s) => ({
      sag: s.nr, dato: s.dato, tidsrum: timeSlotText(s.tidsrumId), adresse: s.kunde.adresse,
      bil: technicianName(s.montorId) || "ikke tildelt", forventetVarighed: formatDuration(orderExpectedMinutes(s)),
    }));
    const technicianText = technicians.map((m) => `${m.navn} (${m.bil})`).join(", ");
    const result = await getAiRouteSuggestion({ grundlag: basis, montorTekst: technicianText, valgtDato: selectedDate });
    setAiLoading(false);
    if (!result.ok) { setAiError(result.fejl || "Kunne ikke hente AI-forslag lige nu. Prøv igen om lidt."); return; }
    setAiAnswer(result.tekst);
  };

  if (areaNames.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">Ugens områdefordeling</h2>
        <button onClick={askAI} disabled={aiLoading} className="text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
          {aiLoading ? "Analyserer..." : "Bed AI om ruteforslag"}
        </button>
      </div>
      <p className="text-xs text-muted mb-3">Grupperet på postnummer/by, ud fra kundens leveringsadresse. Bruges til at opdage dobbeltkørsel og spredte besøg — ikke reel kørselsafstand.</p>

      <div className="rounded-xl border border-line bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left p-2 text-muted font-semibold uppercase tracking-wide">Område</th>
              {week.map((d) => (
                <th key={d} className={`text-center p-2 font-semibold uppercase tracking-wide ${isToday(d) ? "text-brand" : "text-muted"}`}>
                  {new Date(d + "T00:00:00").toLocaleDateString("da-DK", { weekday: "short" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areaNames.map((key) => (
              <tr key={key} className="border-b border-divider">
                <td className="p-2 text-ink font-medium whitespace-nowrap">
                  {key}
                  {isProblem(key) && <AlertCircle size={11} className="inline ml-1 -mt-0.5 text-brand" />}
                </td>
                {week.map((d) => {
                  const here = areas[key]?.[d] || [];
                  const uniqueVehicles = new Set(here.filter((s) => s.montorId).map((s) => s.montorId));
                  const problem = here.length > 0 && uniqueVehicles.size > 1;
                  return (
                    <td key={d} className="p-2 text-center">
                      {here.length > 0 && (
                        <span
                          className={`inline-flex items-center justify-center min-w-[20px] px-1 rounded-md text-[10px] font-semibold ${problem ? "bg-danger text-white" : "bg-panel text-ink"}`}
                          title={here.map((s) => `${s.kunde.navn} — ${technicianName(s.montorId) || "ikke tildelt"}`).join(" · ")}
                        >
                          {here.length}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
        <AlertCircle size={12} className="text-brand shrink-0" /> Rødt tal = flere forskellige biler i samme område samme dag. ⚠ ved områdenavnet = enten dobbeltdækket eller besøgt spredt over flere dage i ugen.
      </p>

      {aiError && <p className="text-xs text-danger mt-2">{aiError}</p>}
      {aiAnswer && (
        <div className="mt-3 rounded-xl border border-ink bg-panel p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink mb-1.5">AI-forslag til bedre ruteplanlægning</p>
          <div className="text-sm text-ink whitespace-pre-wrap">{aiAnswer}</div>
        </div>
      )}
    </div>
  );
}

function DrivingPage({ orders, technicians, vehicles, timeOff, selectedDate, onDateChange, onOpen, onCycleStatus, onAssign, onUpdateTimeSlot, onUpdateTechnician, onRefresh, refreshing }) {
  const dayStart = 7 * 60 + 30;
  const dayEnd = 16 * 60 + 30;
  const PX_PER_MIN = 3.6;
  const width = (dayEnd - dayStart) * PX_PER_MIN;
  const todaysOrders = orders.filter((s) => s.dato === selectedDate);
  const validOrders = todaysOrders.filter((s) => toMinutes(s.start) !== null && toMinutes(s.slut) !== null);
  const hourMarks = [];
  for (let t = Math.ceil(dayStart / 60) * 60; t <= dayEnd; t += 60) hourMarks.push(t);

  const rows = [{ id: null, navn: "Ikke tildelt", bil: "" }, ...technicians];
  const overlaps = (a, b) => toMinutes(a.start) < toMinutes(b.slut) && toMinutes(b.start) < toMinutes(a.slut);

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">{formatLongDate(selectedDate)}</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">Kørselsoverblik</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted">{technicians.length} montører · faste tidsrum</p>
            <DateSelector date={selectedDate} onChange={onDateChange} />
          </div>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-lg text-ink border border-line hover:border-brand hover:text-brand transition-colors" title="Opdater">
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="rounded-xl border border-line bg-white overflow-x-auto">
        <div style={{ width: width + 160, minWidth: "100%" }}>
          <div className="flex sticky top-0 bg-white z-10 border-b border-line">
            <div className="w-[160px] shrink-0 border-r border-line" />
            <div className="relative" style={{ width, height: 26 }}>
              {hourMarks.map((t) => (
                <div key={t} className="absolute top-0 bottom-0 border-l border-divider text-[10px] font-mono text-muted pl-1 pt-1" style={{ left: (t - dayStart) * PX_PER_MIN }}>
                  {String(Math.floor(t / 60)).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          {rows.map((r) => {
            const myOrders = validOrders.filter((s) => s.montorId === r.id);
            const loadMinutes = myOrders.reduce((sum, s) => sum + orderExpectedMinutes(s), 0);
            return (
              <div key={r.id || "utildelt"} className="flex border-b border-divider">
                <div className="w-[160px] shrink-0 border-r border-line p-2.5 flex items-center gap-2 bg-panel">
                  {r.id ? (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: technicianColor(r.id, technicians) }} />
                  ) : (
                    <span className="w-2 h-2 rounded-full shrink-0 border border-brand" />
                  )}
                  <DrivingRowHeader r={r} loadMinutes={loadMinutes} vehicles={vehicles} technicians={technicians} timeOff={timeOff} selectedDate={selectedDate} onUpdateTechnician={onUpdateTechnician} />
                </div>
                <div className="relative" style={{ width, height: 72 }}>
                  {hourMarks.map((t) => (
                    <div key={t} className="absolute top-0 bottom-0 border-l border-divider" style={{ left: (t - dayStart) * PX_PER_MIN }} />
                  ))}
                  {myOrders.map((s) => {
                    const left = (toMinutes(s.start) - dayStart) * PX_PER_MIN;
                    const w = (toMinutes(s.slut) - toMinutes(s.start)) * PX_PER_MIN;
                    const conflict = r.id && myOrders.some((a) => a.id !== s.id && overlaps(a, s));
                    return (
                      <div
                        key={s.id}
                        onClick={() => onOpen(s.id)}
                        className="absolute top-1.5 bottom-1.5 px-2 py-1 rounded-md cursor-pointer overflow-hidden bg-white hover:z-10 hover:shadow-md transition-shadow"
                        style={{ left, width: w, border: conflict ? "1px solid #B3261E" : "1px solid #DDDDDD", borderLeftWidth: 3, borderLeftColor: STATUS_META[s.status].color }}
                        title={conflict ? "Overlapper med en anden sag på samme bil" : ""}
                      >
                        <p className="text-[10px] font-mono text-muted truncate">{s.start}–{s.slut}</p>
                        <p className="text-xs font-semibold text-ink truncate">{buildTitle(s.varelinjer)}</p>
                        <p className="text-[10px] text-muted truncate">{s.kunde.navn}</p>
                        {s.noegle?.kraeves && <p className="text-[10px] text-brand truncate flex items-center gap-0.5"><KeyRound size={9} /> nøgle</p>}
                        {conflict && <p className="text-[10px] text-danger font-semibold">Overlap!</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted mt-3">
        Stop følger de faste tidsrum. Rød kant = overlap på samme bil. Kørselsafstand og reel rute-optimering kræver et korttjeneste-API (fx Google Maps), som ikke er koblet på endnu.
      </p>

      <WeeklyAreas orders={orders} technicians={technicians} selectedDate={selectedDate} />

      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink mt-8 mb-3">Omfordel hurtigt</h2>
      <div className="grid sm:grid-cols-2 gap-2">
        {[...todaysOrders].sort((a, b) => (a.start || "").localeCompare(b.start || "")).map((s) => (
          <OrderCardCompact key={s.id} order={s} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} onAssign={onAssign} onUpdateTimeSlot={onUpdateTimeSlot} />
        ))}
      </div>
    </div>
  );
}

export { toMinutes, DrivingRowHeader, WeeklyAreas, DrivingPage };
