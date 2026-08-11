import React, { useState } from "react";
import { RefreshCw, Pencil, AlertCircle, KeyRound, Clock } from "lucide-react";
import { vehicleBlockedByTimeOff as bilBlokeretAfFerie, vehicleLabel as bilLabel, buildTitle as dannTitel, isToday as erIDag, formatLongDate as formatDatoLang, formatDuration as formatVarighed, technicianColor as montorFarve, areaKey as omraadeNoegle, orderExpectedMinutes as sagForventetMinutter, STATUS_META as statusMeta, timeSlotText as tidsrumTekst, weekDays as ugeDage } from "../data/domain";
import { getAiRouteSuggestion as hentAiRuteforslag } from "../lib/dataStore";
import { DateSelector } from "../components/common";
import { SagKortKompakt } from "../components/SagKortKompakt";

const tilMin = (hhmm) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm || "")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function KoerselRaekkeHeader({ r, belastningMin, biler, montorer, ferier, valgtDato, onUpdateMontor }) {
  const [redigerer, setRedigerer] = useState(false);
  const [bilId, setBilId] = useState(r.bilId || "");
  const tilknyttetBil = biler.find((b) => b.id === r.bilId);
  const ferieBlokering = bilBlokeretAfFerie(r.bilId, valgtDato, montorer, ferier);

  if (!r.id) {
    return <div className="min-w-0"><p className="text-xs font-semibold text-[#1C232E] truncate">{r.navn}</p></div>;
  }

  const gem = (nytBilId) => { onUpdateMontor(r.id, { bilId: nytBilId || null }); setRedigerer(false); };

  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-[#1C232E] truncate">{r.navn}</p>
      {redigerer ? (
        <select
          autoFocus
          value={bilId}
          onChange={(e) => { setBilId(e.target.value); gem(e.target.value); }}
          onBlur={() => setRedigerer(false)}
          className="w-full min-w-0 border border-[#D8D0BE] bg-white px-1 py-0.5 text-[10px] text-[#1C232E] focus:outline-none focus:border-[#E2621B] mt-0.5"
        >
          <option value="">Ingen bil</option>
          {biler.map((b) => (
            <option key={b.id} value={b.id} disabled={b.lukket && b.id !== r.bilId}>
              {bilLabel(b)}{b.lukket ? " (lukket)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <button onClick={() => { setBilId(r.bilId || ""); setRedigerer(true); }} className="flex items-center gap-1 text-[10px] text-[#52697E] hover:text-[#E2621B] border-b border-dashed border-[#B8AF9A] hover:border-[#E2621B] w-fit" title="Klik for at skifte bil">
          <span className="truncate">{tilknyttetBil ? bilLabel(tilknyttetBil) : "Ingen bil"}</span>
          <Pencil size={9} className="shrink-0" />
        </button>
      )}
      {belastningMin > 0 && <p className="text-[10px] text-[#E2621B] font-semibold flex items-center gap-1"><Clock size={9} /> {formatVarighed(belastningMin)} planlagt</p>}
      {tilknyttetBil?.lukket && <p className="text-[10px] text-[#B3261E] font-semibold flex items-center gap-1"><AlertCircle size={9} /> Bil lukket ({tilknyttetBil.lukketAarsag || "værksted"})</p>}
      {!tilknyttetBil?.lukket && ferieBlokering && <p className="text-[10px] text-[#B3261E] font-semibold flex items-center gap-1"><AlertCircle size={9} /> {ferieBlokering.montor.navn} holder ferie</p>}
    </div>
  );
}

// ---------------- Ruteoptimering: ugens områdefordeling + AI-forslag ----------------

function UgensOmraader({ sager, montorer, valgtDato }) {
  const [aiSvar, setAiSvar] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFejl, setAiFejl] = useState(null);

  const uge = ugeDage(valgtDato);
  const ugensSager = sager.filter((s) => uge.includes(s.dato) && s.kunde?.adresse);

  const omraader = {};
  ugensSager.forEach((s) => {
    const key = omraadeNoegle(s.kunde.adresse);
    if (!key) return;
    if (!omraader[key]) omraader[key] = {};
    if (!omraader[key][s.dato]) omraader[key][s.dato] = [];
    omraader[key][s.dato].push(s);
  });
  const omraadeNavne = Object.keys(omraader).sort();
  const montorNavn = (id) => montorer.find((m) => m.id === id)?.navn;

  const erProblem = (key) => {
    const dobbeltDaekket = uge.some((d) => new Set((omraader[key]?.[d] || []).filter((s) => s.montorId).map((s) => s.montorId)).size > 1);
    const spredt = uge.filter((d) => (omraader[key]?.[d] || []).length > 0).length >= 2;
    return dobbeltDaekket || spredt;
  };

  const spoergAI = async () => {
    setAiLoading(true); setAiFejl(null); setAiSvar(null);
    const grundlag = ugensSager.map((s) => ({
      sag: s.nr, dato: s.dato, tidsrum: tidsrumTekst(s.tidsrumId), adresse: s.kunde.adresse,
      bil: montorNavn(s.montorId) || "ikke tildelt", forventetVarighed: formatVarighed(sagForventetMinutter(s)),
    }));
    const montorTekst = montorer.map((m) => `${m.navn} (${m.bil})`).join(", ");
    const resultat = await hentAiRuteforslag({ grundlag, montorTekst, valgtDato });
    setAiLoading(false);
    if (!resultat.ok) { setAiFejl(resultat.fejl || "Kunne ikke hente AI-forslag lige nu. Prøv igen om lidt."); return; }
    setAiSvar(resultat.tekst);
  };

  if (omraadeNavne.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E]">Ugens områdefordeling</h2>
        <button onClick={spoergAI} disabled={aiLoading} className="text-xs font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5">
          {aiLoading ? "Analyserer..." : "Bed AI om ruteforslag"}
        </button>
      </div>
      <p className="text-xs text-[#52697E] mb-3">Grupperet på postnummer/by, ud fra kundens leveringsadresse. Bruges til at opdage dobbeltkørsel og spredte besøg — ikke reel kørselsafstand.</p>

      <div className="border border-[#D8D0BE] bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#D8D0BE]">
              <th className="text-left p-2 text-[#52697E] font-semibold uppercase tracking-wide">Område</th>
              {uge.map((d) => (
                <th key={d} className={`text-center p-2 font-semibold uppercase tracking-wide ${erIDag(d) ? "text-[#E2621B]" : "text-[#52697E]"}`}>
                  {new Date(d + "T00:00:00").toLocaleDateString("da-DK", { weekday: "short" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {omraadeNavne.map((key) => (
              <tr key={key} className="border-b border-[#F0EBDD]">
                <td className="p-2 text-[#1C232E] font-medium whitespace-nowrap">
                  {key}
                  {erProblem(key) && <AlertCircle size={11} className="inline ml-1 -mt-0.5 text-[#E2621B]" />}
                </td>
                {uge.map((d) => {
                  const her = omraader[key]?.[d] || [];
                  const unikkeBiler = new Set(her.filter((s) => s.montorId).map((s) => s.montorId));
                  const problem = her.length > 0 && unikkeBiler.size > 1;
                  return (
                    <td key={d} className="p-2 text-center">
                      {her.length > 0 && (
                        <span
                          className={`inline-flex items-center justify-center min-w-[20px] px-1 text-[10px] font-semibold ${problem ? "bg-[#B3261E] text-white" : "bg-[#F3EFE6] text-[#1C232E]"}`}
                          title={her.map((s) => `${s.kunde.navn} — ${montorNavn(s.montorId) || "ikke tildelt"}`).join(" · ")}
                        >
                          {her.length}
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
      <p className="text-xs text-[#52697E] mt-2 flex items-center gap-1.5">
        <AlertCircle size={12} className="text-[#E2621B] shrink-0" /> Rødt tal = flere forskellige biler i samme område samme dag. ⚠ ved områdenavnet = enten dobbeltdækket eller besøgt spredt over flere dage i ugen.
      </p>

      {aiFejl && <p className="text-xs text-[#B3261E] mt-2">{aiFejl}</p>}
      {aiSvar && (
        <div className="mt-3 border border-[#1C232E] bg-[#FCFAF4] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1C232E] mb-1.5">AI-forslag til bedre ruteplanlægning</p>
          <div className="text-sm text-[#1C232E] whitespace-pre-wrap">{aiSvar}</div>
        </div>
      )}
    </div>
  );
}

function KoerselSide({ sager, montorer, biler, ferier, valgtDato, onSkiftDato, onOpen, onCycleStatus, onAssign, onUpdateTidsrum, onUpdateMontor, onRefresh, refreshing }) {
  const dagStart = 7 * 60 + 30;
  const dagSlut = 16 * 60 + 30;
  const PX_PER_MIN = 3.6;
  const bredde = (dagSlut - dagStart) * PX_PER_MIN;
  const dagensSager = sager.filter((s) => s.dato === valgtDato);
  const gyldige = dagensSager.filter((s) => tilMin(s.start) !== null && tilMin(s.slut) !== null);
  const timeMarkoerer = [];
  for (let t = Math.ceil(dagStart / 60) * 60; t <= dagSlut; t += 60) timeMarkoerer.push(t);

  const raekker = [{ id: null, navn: "Ikke tildelt", bil: "" }, ...montorer];
  const overlapper = (a, b) => tilMin(a.start) < tilMin(b.slut) && tilMin(b.start) < tilMin(a.slut);

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">{formatDatoLang(valgtDato)}</p>
          <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E]">Kørselsoverblik</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-[#52697E]">{montorer.length} montører · faste tidsrum</p>
            <DateSelector date={valgtDato} onChange={onSkiftDato} />
          </div>
        </div>
        <button onClick={onRefresh} className="p-2 text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B] transition-colors" title="Opdater">
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="border border-[#D8D0BE] bg-white overflow-x-auto">
        <div style={{ width: bredde + 160, minWidth: "100%" }}>
          <div className="flex sticky top-0 bg-white z-10 border-b border-[#D8D0BE]">
            <div className="w-[160px] shrink-0 border-r border-[#D8D0BE]" />
            <div className="relative" style={{ width: bredde, height: 26 }}>
              {timeMarkoerer.map((t) => (
                <div key={t} className="absolute top-0 bottom-0 border-l border-[#F0EBDD] text-[10px] font-mono text-[#52697E] pl-1 pt-1" style={{ left: (t - dagStart) * PX_PER_MIN }}>
                  {String(Math.floor(t / 60)).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          {raekker.map((r) => {
            const mineSager = gyldige.filter((s) => s.montorId === r.id);
            const belastningMin = mineSager.reduce((sum, s) => sum + sagForventetMinutter(s), 0);
            return (
              <div key={r.id || "utildelt"} className="flex border-b border-[#F0EBDD]">
                <div className="w-[160px] shrink-0 border-r border-[#D8D0BE] p-2.5 flex items-center gap-2 bg-[#FCFAF4]">
                  {r.id ? (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: montorFarve(r.id, montorer) }} />
                  ) : (
                    <span className="w-2 h-2 rounded-full shrink-0 border border-[#E2621B]" />
                  )}
                  <KoerselRaekkeHeader r={r} belastningMin={belastningMin} biler={biler} montorer={montorer} ferier={ferier} valgtDato={valgtDato} onUpdateMontor={onUpdateMontor} />
                </div>
                <div className="relative" style={{ width: bredde, height: 72 }}>
                  {timeMarkoerer.map((t) => (
                    <div key={t} className="absolute top-0 bottom-0 border-l border-[#F0EBDD]" style={{ left: (t - dagStart) * PX_PER_MIN }} />
                  ))}
                  {mineSager.map((s) => {
                    const venstre = (tilMin(s.start) - dagStart) * PX_PER_MIN;
                    const br = (tilMin(s.slut) - tilMin(s.start)) * PX_PER_MIN;
                    const konflikt = r.id && mineSager.some((a) => a.id !== s.id && overlapper(a, s));
                    return (
                      <div
                        key={s.id}
                        onClick={() => onOpen(s.id)}
                        className="absolute top-1.5 bottom-1.5 px-2 py-1 cursor-pointer overflow-hidden bg-white hover:z-10 hover:shadow-md transition-shadow"
                        style={{ left: venstre, width: br, border: konflikt ? "1px solid #B3261E" : "1px solid #D8D0BE", borderLeftWidth: 3, borderLeftColor: statusMeta[s.status].color }}
                        title={konflikt ? "Overlapper med en anden sag på samme bil" : ""}
                      >
                        <p className="text-[10px] font-mono text-[#52697E] truncate">{s.start}–{s.slut}</p>
                        <p className="text-xs font-semibold text-[#1C232E] truncate">{dannTitel(s.varelinjer)}</p>
                        <p className="text-[10px] text-[#52697E] truncate">{s.kunde.navn}</p>
                        {s.noegle?.kraeves && <p className="text-[10px] text-[#E2621B] truncate flex items-center gap-0.5"><KeyRound size={9} /> nøgle</p>}
                        {konflikt && <p className="text-[10px] text-[#B3261E] font-semibold">Overlap!</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-[#52697E] mt-3">
        Stop følger de faste tidsrum. Rød kant = overlap på samme bil. Kørselsafstand og reel rute-optimering kræver et korttjeneste-API (fx Google Maps), som ikke er koblet på endnu.
      </p>

      <UgensOmraader sager={sager} montorer={montorer} valgtDato={valgtDato} />

      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mt-8 mb-3">Omfordel hurtigt</h2>
      <div className="grid sm:grid-cols-2 gap-2">
        {[...dagensSager].sort((a, b) => (a.start || "").localeCompare(b.start || "")).map((s) => (
          <SagKortKompakt key={s.id} sag={s} montorer={montorer} onOpen={onOpen} onCycleStatus={onCycleStatus} onAssign={onAssign} onUpdateTidsrum={onUpdateTidsrum} />
        ))}
      </div>
    </div>
  );
}

// ---------------- Side: Montør ----------------



export { tilMin, KoerselRaekkeHeader, UgensOmraader, KoerselSide };
