import React, { useState } from "react";
import { Trash2, X, Plus, AlertCircle, History, KeyRound, Clock, Truck, MapPin, Sparkles } from "lucide-react";
import { OTHER_PRODUCT_TYPE, OTHER_PRODUCT_TYPE_ID, KEY_ACCESS_TYPES, buildingKey, formatLongDate, formatDuration, lineItemMinutes, availableAddOns, serviceIcon, todayISO, weekDays, orderExpectedMinutes } from "../data/domain";
import { getAiRouteSuggestion } from "../lib/dataStore";

function LineItemEditor({ lineItem, productTypes, productCategories, primaryServices, addOnServices, onChange, onRemove, canRemove }) {
  const isOther = lineItem.varetypeId === OTHER_PRODUCT_TYPE_ID;
  const selectedProductType = productTypes.find((v) => v.id === lineItem.varetypeId);
  const [categoryFilter, setCategoryFilter] = useState(selectedProductType?.kategoriId || "");

  const visibleProductTypes = categoryFilter ? productTypes.filter((v) => v.kategoriId === categoryFilter) : productTypes;
  const available = availableAddOns(lineItem.varetypeId, lineItem.primaerYdelse?.id, addOnServices);

  const changeProductType = (newId) => {
    if (newId === lineItem.varetypeId) return;
    const vt = newId === OTHER_PRODUCT_TYPE_ID ? null : productTypes.find((v) => v.id === newId);
    const newAvailable = availableAddOns(newId, lineItem.primaerYdelse?.id, addOnServices);
    onChange({
      ...lineItem,
      varetypeId: newId,
      varetypeNavn: vt ? vt.navn : OTHER_PRODUCT_TYPE,
      varetypeTekst: "",
      tillaeg: lineItem.tillaeg.filter((t) => newAvailable.some((n) => n.navn === t.navn)),
    });
  };

  const changePrimaryService = (newId) => {
    const py = primaryServices.find((p) => p.id === newId);
    if (!py) return;
    const newAvailable = availableAddOns(lineItem.varetypeId, newId, addOnServices);
    onChange({
      ...lineItem,
      primaerYdelse: { id: py.id, navn: py.navn, minutter: Number(py.minutter) || 0 },
      tillaeg: lineItem.tillaeg.filter((t) => newAvailable.some((n) => n.navn === t.navn)),
    });
  };

  const changePrimaryServiceMinutes = (min) => onChange({ ...lineItem, primaerYdelse: { ...lineItem.primaerYdelse, minutter: Number(min) || 0 } });

  const toggleAddOn = (t) => {
    const has = lineItem.tillaeg.some((x) => x.id === t.id || x.navn === t.navn);
    if (has) {
      onChange({ ...lineItem, tillaeg: lineItem.tillaeg.filter((x) => x.id !== t.id && x.navn !== t.navn) });
    } else {
      onChange({ ...lineItem, tillaeg: [...lineItem.tillaeg, { id: t.id, navn: t.navn, minutter: Number(t.minutter) || 0, udfoert: false }] });
    }
  };
  const toggleDone = (id) => onChange({ ...lineItem, tillaeg: lineItem.tillaeg.map((y) => (y.id === id ? { ...y, udfoert: !y.udfoert } : y)) });
  const changeAddOnMinutes = (id, min) => onChange({ ...lineItem, tillaeg: lineItem.tillaeg.map((y) => (y.id === id ? { ...y, minutter: Number(min) || 0 } : y)) });

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="grid gap-2 sm:grid-cols-3 mb-2">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand">
          <option value="">Alle kategorier</option>
          {productCategories.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
        </select>
        <select value={lineItem.varetypeId} onChange={(e) => changeProductType(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand">
          {visibleProductTypes.map((v) => <option key={v.id} value={v.id}>{v.navn}</option>)}
          <option value={OTHER_PRODUCT_TYPE_ID}>{OTHER_PRODUCT_TYPE}</option>
        </select>
        <div className="flex items-center gap-1.5">
          <select value={lineItem.primaerYdelse?.id || ""} onChange={(e) => changePrimaryService(e.target.value)} className="flex-1 rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand">
            {primaryServices.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
          </select>
          {canRemove && <button onClick={onRemove} className="p-1.5 text-muted hover:text-danger shrink-0" title="Fjern varelinje"><Trash2 size={15} /></button>}
        </div>
      </div>

      {isOther && (
        <input
          value={lineItem.varetypeTekst}
          onChange={(e) => onChange({ ...lineItem, varetypeTekst: e.target.value })}
          placeholder="Beskriv varen/opgaven, fx 'Specialbygget vinkøleskab'"
          className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink mb-2 focus:outline-none focus:border-brand"
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2 mb-2">
        <input value={lineItem.maerke} onChange={(e) => onChange({ ...lineItem, maerke: e.target.value })} placeholder="Mærke, fx 'Bosch'" className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand" />
        <input value={lineItem.model} onChange={(e) => onChange({ ...lineItem, model: e.target.value })} placeholder="Modelnummer" className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand" />
      </div>

      <label className="flex items-center gap-2 mb-2 text-xs text-muted">
        <Clock size={12} className="shrink-0" />
        Estimeret tid til {lineItem.primaerYdelse?.navn?.toLowerCase() || "denne ydelse"}
        <input
          type="number" min="0"
          value={lineItem.primaerYdelse?.minutter ?? 0}
          onChange={(e) => changePrimaryServiceMinutes(e.target.value)}
          className="w-16 rounded-lg border border-line bg-white px-2 py-1 text-right text-ink focus:outline-none focus:border-brand"
        />
        min
      </label>

      {available.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Tillægsydelser</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map((t) => {
              const selected = lineItem.tillaeg.find((x) => x.id === t.id || x.navn === t.navn);
              const Icon = serviceIcon(t.navn);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleAddOn(t)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${selected ? "border-success bg-success/10 text-success" : "border-line text-muted hover:border-brand hover:text-brand"}`}
                >
                  <Icon size={12} strokeWidth={2.5} />
                  {t.navn}
                  <span className="text-[10px] opacity-70">{t.minutter}m</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {lineItem.tillaeg.length > 0 && (
        <div className="space-y-1 mb-2 border-t border-divider pt-2">
          {lineItem.tillaeg.map((y) => {
            const Icon = serviceIcon(y.navn);
            return (
              <div key={y.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-white group">
                <input type="checkbox" checked={y.udfoert} onChange={() => toggleDone(y.id)} className="w-4 h-4 accent-success shrink-0" title="Udført" />
                <Icon size={13} className="text-muted shrink-0" strokeWidth={2.5} />
                <span className="text-sm text-ink flex-1 truncate">{y.navn}</span>
                <input
                  type="number" min="0"
                  value={y.minutter}
                  onChange={(e) => changeAddOnMinutes(y.id, e.target.value)}
                  className="w-14 rounded-lg border border-line bg-white px-1.5 py-0.5 text-right text-[10px] text-ink focus:outline-none focus:border-brand"
                  title="Estimeret tid for denne tillægsydelse"
                />
                <span className="text-[10px] text-muted">min</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted flex items-center gap-1"><Clock size={10} /> I alt for denne linje: {formatDuration(lineItemMinutes(lineItem))}</p>
    </div>
  );
}

function KeyAccessFields({ keyAccess, onChange }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <input type="checkbox" checked={keyAccess.kraeves} onChange={(e) => onChange({ ...keyAccess, kraeves: e.target.checked })} className="w-4 h-4 accent-brand" />
        <KeyRound size={14} className="text-muted" />
        <span className="text-sm font-medium text-ink">Kræver nøgle/adgang</span>
      </label>
      {keyAccess.kraeves && (
        <div className="grid gap-2 sm:grid-cols-2 pl-1">
          <select value={keyAccess.type} onChange={(e) => onChange({ ...keyAccess, type: e.target.value })} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand">
            <option value="">Vælg type</option>
            {KEY_ACCESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={keyAccess.detaljer} onChange={(e) => onChange({ ...keyAccess, detaljer: e.target.value })} placeholder="Detaljer, fx kode eller nøgleboks-nr." className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand" />
          <input value={keyAccess.placering} onChange={(e) => onChange({ ...keyAccess, placering: e.target.value })} placeholder="Placering, fx 'Ved hoveddøren bag lampen'" className="sm:col-span-2 rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand" />
        </div>
      )}
    </div>
  );
}

// Viser kun KOMMENDE sager (i dag eller frem) på samme opgang/ejendom - en
// sag der allerede er overstået er ikke noget man kan koordinere kørsel
// med, og ville ellers dukke op som et forslag der reelt er ubrugeligt
// ("der var en sag her for 3 uger siden").
function AddressSuggestion({ address, date, orders, onUseDate }) {
  const key = buildingKey(address);
  if (!key || address.trim().length < 5) return null;
  const today = todayISO();
  const matches = (orders || []).filter((s) => s.dato && s.dato !== date && s.dato >= today && buildingKey(s.kunde?.adresse) === key);
  if (matches.length === 0) return null;
  const dates = [...new Set(matches.map((s) => s.dato))].sort();
  return (
    <div className="mb-3 rounded-xl border border-brand bg-brand/10 p-3">
      <p className="text-sm font-semibold text-brand flex items-center gap-1.5"><AlertCircle size={14} /> Samme opgang/ejendom er allerede booket</p>
      <p className="text-xs text-muted mt-1">Der er allerede en kommende sag på denne adresse på en anden dag — overvej at samle dem, så I ikke kører to gange til samme opgang:</p>
      <div className="mt-2 space-y-1">
        {dates.map((d) => {
          const onThatDay = matches.filter((s) => s.dato === d);
          return (
            <div key={d} className="rounded-lg bg-white border border-line px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-ink">{formatLongDate(d)}</span>
                <button onClick={() => onUseDate(d)} className="text-[10px] font-semibold uppercase tracking-wide text-ink border border-line rounded-full hover:border-brand hover:text-brand px-2 py-1 shrink-0">Brug denne dato</button>
              </div>
              {onThatDay.map((s) => (
                <p key={s.id} className="text-[11px] text-muted flex items-center gap-1 mt-0.5"><MapPin size={10} className="shrink-0" /> {s.kunde.navn} — {s.kunde.adresse}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Kundeopslag: mens sælgeren taster telefon/navn, tjekkes det op mod ALLE
// tidligere ordrer (samme liste, som formularen allerede har fået sendt).
// Matcher på telefonnummer (mest pålidelige - normaliseret uden mellemrum)
// eller på eksakt (case-insensitive) navn, hvis der ikke er noget
// telefonnummer at matche på endnu. Kræver et onOpen-prop for at kunne
// klikke sig ind på en tidligere sag - ellers vises listen blot som
// information uden klik-mulighed.
function CustomerHistory({ phone, name, orders, onOpen }) {
  const normPhone = (phone || "").replace(/\D/g, "");
  const normName = (name || "").trim().toLowerCase();
  if (normPhone.length < 6 && normName.length < 3) return null;

  const matches = (orders || [])
    .filter((o) => {
      const oPhone = (o.kunde?.telefon || "").replace(/\D/g, "");
      const oName = (o.kunde?.navn || "").trim().toLowerCase();
      const phoneMatch = normPhone.length >= 6 && oPhone && oPhone === normPhone;
      const nameMatch = normName.length >= 3 && oName && oName === normName;
      return phoneMatch || nameMatch;
    })
    .sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start));

  if (matches.length === 0) return null;
  const shown = matches.slice(0, 3);

  return (
    <div className="mb-3 rounded-xl border border-info bg-info/10 p-3">
      <p className="text-sm font-semibold text-info flex items-center gap-1.5">
        <History size={14} /> Kendt kunde — {matches.length} tidligere {matches.length === 1 ? "sag" : "sager"}
      </p>
      <div className="mt-2 space-y-1">
        {shown.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen?.(s.id)}
            disabled={!onOpen}
            className="w-full text-left rounded-lg bg-white border border-line px-2 py-1.5 hover:border-info transition-colors disabled:cursor-default"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink">{formatLongDate(s.dato)}</span>
              <span className="text-[10px] font-mono text-muted">#{s.nr}</span>
            </div>
            <p className="text-[11px] text-muted truncate">{s.kunde?.adresse}</p>
          </button>
        ))}
      </div>
      {matches.length > shown.length && <p className="text-[11px] text-muted mt-1.5">+ {matches.length - shown.length} flere tidligere sager.</p>}
    </div>
  );
}

// Overblik over dagens allerede planlagte kørsler, grupperet pr. bil/tekniker
// - så sælgeren kan se med det samme hvem der kører hvor den valgte dag, og
// booke mere effektivt (fx lægge en ny sag hos en bil der alligevel er i
// området). Viser sig kun når der rent faktisk er noget booket den dag.
function DailyRouteOverview({ orders, technicians, date }) {
  if (!date) return null;
  const todaysOrders = (orders || []).filter((s) => s.dato === date).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  if (todaysOrders.length === 0) return null;

  const rows = [{ id: null, navn: "Ikke tildelt endnu", bil: "" }, ...technicians]
    .map((m) => ({ ...m, orders: todaysOrders.filter((s) => s.montorId === m.id) }))
    .filter((g) => g.orders.length > 0);

  return (
    <div className="mb-4 rounded-xl border border-line bg-panel p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink mb-2.5 flex items-center gap-1.5">
        <Truck size={13} /> Dagens ruter — {formatLongDate(date)} <span className="font-mono text-muted">({todaysOrders.length} sager)</span>
      </p>
      <div className="space-y-3">
        {rows.map((g) => (
          <div key={g.id || "utildelt"}>
            <p className="text-[11px] font-semibold text-muted mb-1">
              {g.navn}{g.bil ? ` — ${g.bil}` : ""} <span className="font-mono">({g.orders.length})</span>
            </p>
            <div className="space-y-1">
              {g.orders.map((s) => (
                <div key={s.id} className="flex items-start gap-2 text-xs rounded-lg bg-white border border-line px-2 py-1.5">
                  <span className="font-mono text-muted shrink-0">{s.start}</span>
                  <span className="text-ink shrink-0 font-medium">{s.kunde?.navn}</span>
                  <span className="text-muted truncate flex items-center gap-1"><MapPin size={10} className="shrink-0" /> {s.kunde?.adresse}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const WORKDAY_MINUTES = 450; // ~7,5 time - samme tærskel som Planlægnings ugekapacitet
function hoursLabel(minutes) {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t${m}m` : `${h}t`;
}

// Ugekapacitet vist i bookingflowets SIDSTE trin - så sælgeren kan se
// hvilke dage der allerede er fyldt op, FØR en dato vælges, i stedet for
// at skulle gætte og risikere at overbooke en montør.
function WeeklyScheduleOverview({ orders, technicians, date }) {
  const anchor = date || todayISO();
  const week = weekDays(anchor);
  const today = todayISO();
  const rows = [...technicians, { id: null, navn: "Ikke tildelt" }];

  const cellFor = (technicianId, day) => {
    const dayOrders = (orders || []).filter((o) => o.montorId === technicianId && o.dato === day && o.status !== "afsluttet");
    const minutes = dayOrders.reduce((sum, o) => sum + orderExpectedMinutes(o), 0);
    return { count: dayOrders.length, minutes };
  };

  return (
    <div className="rounded-xl border border-line bg-white p-3 mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink mb-2">Ugens kapacitet</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left p-1.5 text-muted font-semibold uppercase tracking-wide">Montør</th>
              {week.map((d) => (
                <th key={d} className={`text-center p-1.5 font-semibold uppercase tracking-wide ${d === date ? "text-brand" : d === today ? "text-ink" : "text-muted"}`}>
                  {new Date(d + "T00:00:00").toLocaleDateString("da-DK", { weekday: "short" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id || "utildelt"} className="border-b border-divider last:border-b-0">
                <td className="p-1.5 text-ink font-medium whitespace-nowrap">{r.navn}</td>
                {week.map((d) => {
                  const { count, minutes } = cellFor(r.id, d);
                  const overloaded = minutes > WORKDAY_MINUTES;
                  return (
                    <td key={d} className={`p-1.5 text-center ${d === date ? "bg-brand/10" : ""}`}>
                      {count === 0 ? (
                        <span className="text-line">–</span>
                      ) : (
                        <span
                          className={`inline-flex flex-col items-center px-1.5 py-0.5 rounded-lg ${overloaded ? "bg-danger text-white" : "bg-panel text-ink"}`}
                          title={`${count} ${count === 1 ? "sag" : "sager"} · ${hoursLabel(minutes)}`}
                        >
                          <span className="font-semibold">{hoursLabel(minutes)}</span>
                          <span className="text-[9px] opacity-80">{count} {count === 1 ? "sag" : "sager"}</span>
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
      <p className="text-[10px] text-muted mt-2">Den valgte dato er markeret. Rødt = allerede booket mere end en arbejdsdag ({hoursLabel(WORKDAY_MINUTES)}).</p>
    </div>
  );
}

// AI-forslag til PLACERING af den nye sag (hvilken dag/montør passer bedst
// ind i ugens eksisterende ruter) - adskilt fra AI-ruteforslaget i
// Kørselsoverblik, som i stedet analyserer allerede bookede sager for
// ineffektiv kørsel. Samme underliggende edge function, forskellig prompt
// (se ai-ruteforslag), skelnet på om `jobSummary` (nyOpgave) er angivet.
//
// Forslaget er RÅDGIVENDE - det sætter ikke selv dato/montør, sælgeren skal
// stadig selv vælge nedenfor. Det er bevidst, jf. at AI-forslag i denne app
// aldrig må ændre forretningsdata automatisk.
function AiPlacementSuggestion({ orders, technicians, date, jobSummary }) {
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);

  const ask = async () => {
    setLoading(true); setError(null); setAnswer(null);
    const week = weekDays(date || todayISO());
    const weekOrders = (orders || []).filter((o) => week.includes(o.dato) && o.kunde?.adresse);
    const grundlag = weekOrders.map((s) => ({
      sag: s.nr, dato: s.dato, adresse: s.kunde.adresse,
      bil: technicians.find((m) => m.id === s.montorId)?.navn || "ikke tildelt",
    }));
    const montorTekst = technicians.map((m) => `${m.navn} (${m.bil})`).join(", ");
    const result = await getAiRouteSuggestion({ grundlag, montorTekst, valgtDato: date, nyOpgave: jobSummary });
    setLoading(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke hente AI-forslag lige nu. Prøv igen om lidt."); return; }
    setAnswer(result.tekst);
  };

  return (
    <div className="rounded-xl border border-ink bg-panel p-3 mb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink flex items-center gap-1.5"><Sparkles size={13} /> AI-forslag til placering</p>
        <button onClick={ask} disabled={loading} className="text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors px-3 py-1.5 rounded-lg disabled:opacity-50">
          {loading ? "Analyserer..." : "Bed AI om forslag"}
        </button>
      </div>
      {!answer && !error && !loading && (
        <p className="text-[11px] text-muted mt-1.5">Foreslår bedste dag og montør ud fra ugens eksisterende ruter og adresser. Et forslag, ikke en automatisk booking — du vælger stadig selv nedenfor.</p>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      {answer && <div className="text-sm text-ink whitespace-pre-wrap mt-2 pt-2 border-t border-line">{answer}</div>}
    </div>
  );
}

export { LineItemEditor, KeyAccessFields, AddressSuggestion, CustomerHistory, DailyRouteOverview, WeeklyScheduleOverview, AiPlacementSuggestion };
