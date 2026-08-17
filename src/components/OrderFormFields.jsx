import React, { useState, useEffect, useCallback, useRef } from "react";
import { Trash2, X, Plus, AlertCircle, History, KeyRound, Clock, Truck, MapPin, Sparkles, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, ExternalLink } from "lucide-react";
import { OTHER_PRODUCT_TYPE, OTHER_PRODUCT_TYPE_ID, KEY_ACCESS_TYPES, buildingKey, formatLongDate, formatDuration, lineItemMinutes, availableAddOns, serviceIcon, todayISO, addDays, weekDays, orderExpectedMinutes } from "../data/domain";
import { getAiRouteSuggestion } from "../lib/dataStore";
import { geocodeAddress, geocodeAddresses, drivingDistances } from "../lib/geocoding";

// Modelnummer-tjek mod punkt1.dk: punkt1.dk er en JavaScript-renderet side
// uden noget offentligt/dokumenteret søge-API vi kan finde og med sikkerhed
// kalde direkte fra en edge function - at gætte på et internt endpoint ville
// risikere at give FORKERT eller INGEN data, uden varsel når det en dag
// ændrer sig. I stedet for at foregive automatisk verifikation, åbner denne
// knap en Google-søgning afgrænset til punkt1.dk i en ny fane, så sælgeren
// selv kan bekræfte modellen og aflæse mærket på 5 sekunder - 100%
// pålideligt, kræver ingen gætning om deres interne systemer. Rigtig
// automatisk udfyldning af mærke-feltet kræver en officiel API-aftale med
// punkt1.dk's tekniske team.
function ModelNumberCheckLink({ model }) {
  if (!model || model.trim().length < 2) return null;
  const url = `https://www.google.com/search?q=${encodeURIComponent(`site:punkt1.dk ${model.trim()}`)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-info hover:text-brand mt-1"
      title="Åbner en søgning på punkt1.dk for dette modelnummer i en ny fane"
    >
      <ExternalLink size={10} /> Tjek "{model.trim()}" på punkt1.dk
    </a>
  );
}

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

      <div className="grid gap-2 sm:grid-cols-2 mb-1">
        <input value={lineItem.maerke} onChange={(e) => onChange({ ...lineItem, maerke: e.target.value })} placeholder="Mærke, fx 'Bosch'" className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand" />
        <div>
          <input value={lineItem.model} onChange={(e) => onChange({ ...lineItem, model: e.target.value })} placeholder="Modelnummer" className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand" />
          <ModelNumberCheckLink model={lineItem.model} />
        </div>
      </div>
      <p className="text-[10px] text-muted mb-2">Modelnummer-tjek åbner en søgning i en ny fane, så du kan aflæse/bekræfte mærket — udfyldes ikke automatisk endnu.</p>

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

const WORKDAY_MINUTES = 450; // ~7,5 time
function hoursLabel(minutes) {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t${m}m` : `${h}t`;
}

// Ugekapacitet - vist som en valgfri, klappet-sammen detalje under de
// foreslåede datoer (se SuggestedDates), til den der vil dobbelttjekke selv.
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
      <p className="text-[10px] text-muted mt-2">Rødt = allerede booket mere end en arbejdsdag ({hoursLabel(WORKDAY_MINUTES)}).</p>
    </div>
  );
}

// Interaktiv ugevisning til MANUELT datovalg - erstatter et rent
// dato-inputfelt som eneste måde at vælge dato på. Blad frem/tilbage
// mellem uger, se hvordan hver bil/montør er booket dag for dag, og klik
// direkte på en dag (evt. under en bestemt montørs række) for at vælge
// den - klik under en montørs række vælger BÅDE dato og den montør, klik
// på selve dags-overskriften vælger kun dato. Let, overskueligt: samme
// visuelle sprog som ugekapaciteten ovenfor, bare interaktiv og med egen
// uge-navigation uafhængig af den valgte dato.
function shortDayLabel(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { weekday: "short" });
}
function shortDateLabel(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

function InteractiveWeekPicker({ orders, technicians, date, onSelectDate }) {
  const [weekAnchor, setWeekAnchor] = useState(date || todayISO());
  const week = weekDays(weekAnchor);
  const today = todayISO();
  const rows = [...technicians, { id: null, navn: "Ikke tildelt" }];

  const cellFor = (technicianId, day) => {
    const dayOrders = (orders || []).filter((o) => o.montorId === technicianId && o.dato === day && o.status !== "afsluttet");
    const minutes = dayOrders.reduce((sum, o) => sum + orderExpectedMinutes(o), 0);
    return { count: dayOrders.length, minutes };
  };

  return (
    <div className="rounded-xl border border-line bg-white p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setWeekAnchor((w) => addDays(w, -7))} className="p-1.5 rounded-lg text-muted hover:text-brand border border-line hover:border-brand transition-colors" title="Forrige uge">
          <ChevronLeft size={14} />
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">{shortDateLabel(week[0])} – {shortDateLabel(week[6])}</p>
          {weekAnchor !== today && (
            <button onClick={() => setWeekAnchor(today)} className="text-[10px] font-semibold uppercase tracking-wide text-brand hover:underline">Gå til denne uge</button>
          )}
        </div>
        <button onClick={() => setWeekAnchor((w) => addDays(w, 7))} className="p-1.5 rounded-lg text-muted hover:text-brand border border-line hover:border-brand transition-colors" title="Næste uge">
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left p-1 text-muted font-semibold uppercase tracking-wide w-20">Montør</th>
              {week.map((d) => (
                <th key={d} className="p-0.5">
                  <button
                    onClick={() => onSelectDate(d, null)}
                    className={`w-full flex flex-col items-center py-1.5 rounded-lg transition-colors ${d === date ? "bg-brand text-white" : d === today ? "bg-panel text-ink font-semibold" : "text-muted hover:bg-panel"}`}
                  >
                    <span className="text-[9px] uppercase">{shortDayLabel(d)}</span>
                    <span className="text-sm font-semibold">{new Date(d + "T00:00:00").getDate()}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id || "utildelt"}>
                <td className="p-1 text-ink font-medium whitespace-nowrap">{r.navn}</td>
                {week.map((d) => {
                  const { count, minutes } = cellFor(r.id, d);
                  const overloaded = minutes > WORKDAY_MINUTES;
                  const selected = d === date;
                  return (
                    <td key={d} className="p-0.5">
                      <button
                        onClick={() => onSelectDate(d, r.id)}
                        title={`${r.navn} · ${shortDateLabel(d)}${count > 0 ? ` · ${count} ${count === 1 ? "sag" : "sager"}, ${hoursLabel(minutes)}` : ", ledig"}`}
                        className={`w-full flex items-center justify-center py-1.5 rounded-lg border transition-colors ${selected ? "border-brand bg-brand/10" : "border-transparent hover:border-line"}`}
                      >
                        {count === 0 ? (
                          <span className="text-line">–</span>
                        ) : (
                          <span className={`px-1.5 py-0.5 rounded-md font-semibold ${overloaded ? "bg-danger text-white" : "bg-panel text-ink"}`}>{hoursLabel(minutes)}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted mt-2">Klik på en dag for kun at vælge dato — klik under en montørs egen række for at vælge dato og montør samtidig. Rødt tal = mere end en arbejdsdag booket ({hoursLabel(WORKDAY_MINUTES)}).</p>
    </div>
  );
}

// ÉT samlet, AI-prioriteret forslag til levering/montering - erstatter det
// der FØR var 3-4 separate bokse (samme opgang, køreafstand, AI-tekst,
// ugekapacitet), som alle konkurrerede om opmærksomheden samtidig. Formålet
// er at gøre det hurtigt og enkelt for en sælger, der står hos kunden og
// skal aftale en dato der og da: ÉT sæt klikbare forslag, ikke fire ting at
// læse og selv sammenligne.
//
// Kører automatisk når trinnet vises (kræver adresse udfyldt fra kunde-
// trinnet) - ingen knap man skal huske at trykke først. "Samme opgang" og
// "køreafstand" beregnes stadig (samme logik som før), men vises IKKE som
// egne bokse - de sendes i stedet med som en del af grundlaget til AI'en,
// som selv vejer dem sammen med ugens kapacitet og returnerer 1-3 konkrete,
// klikbare forslag. Et klik sætter dato (og evt. montør) med det samme.
//
// Forslagene er RÅDGIVENDE, ikke en automatisk booking - sælgeren skal
// stadig trykke "Book sag" til sidst, og kan altid vælge en helt anden
// dato manuelt nedenfor (se InteractiveWeekPicker ovenfor).
function SuggestedDates({ orders, technicians, date, address, jobSummary, onSelectDate }) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const ranRef = useRef(false);

  const run = useCallback(async () => {
    if (!address || address.trim().length < 5) {
      setError("Udfyld leveringsadressen på leveringstrinnet først, så kan der beregnes forslag.");
      return;
    }
    setLoading(true); setError(null);

    const anchor = date || todayISO();
    const week = weekDays(anchor);
    const weekOrders = (orders || []).filter((o) => week.includes(o.dato) && o.kunde?.adresse);

    // Samme opgang/bygning - ingen netværkskald nødvendigt.
    const key = buildingKey(address);
    const sameBuildingDates = key
      ? [...new Set(weekOrders.filter((o) => o.dato !== anchor && buildingKey(o.kunde.adresse) === key).map((o) => o.dato))]
      : [];

    // Nærliggende sager (køreafstand) - kræver geokodning. Fejler den
    // stille (fx ingen ORS-nøgle sat op), fortsætter vi bare uden det
    // signal - resten af forslaget bygger stadig på kapacitet+samme opgang.
    let nearbyDates = [];
    try {
      const source = await geocodeAddress(address);
      if (source) {
        const others = weekOrders.filter((o) => o.dato !== anchor);
        const coordMap = await geocodeAddresses(others.map((o) => o.kunde.adresse));
        const withCoords = others
          .map((o) => ({ order: o, coord: coordMap.get(o.kunde.adresse.trim().toLowerCase()) }))
          .filter((x) => x.coord);
        if (withCoords.length > 0) {
          const distances = await drivingDistances(source, withCoords.map((x) => x.coord));
          nearbyDates = withCoords
            .map((x, i) => ({ dato: x.order.dato, km: distances[i] != null ? distances[i] / 1000 : null }))
            .filter((x) => x.km != null && x.km <= 5)
            .map((x) => ({ dato: x.dato, km: Math.round(x.km * 10) / 10 }));
        }
      }
    } catch (_) {
      // Stille - se kommentar ovenfor.
    }

    const grundlag = weekOrders.map((s) => ({
      sag: s.nr, dato: s.dato, adresse: s.kunde.adresse,
      bil: technicians.find((m) => m.id === s.montorId)?.navn || "ikke tildelt",
    }));
    const montorTekst = technicians.map((m) => `${m.navn} (${m.bil})`).join(", ");
    const nyOpgave = { ...jobSummary, sammeOpgangDatoer: sameBuildingDates, naerliggendeDatoer: nearbyDates };

    const result = await getAiRouteSuggestion({ grundlag, montorTekst, valgtDato: anchor, nyOpgave });
    setLoading(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke hente forslag lige nu."); return; }
    setSuggestions(result.forslag || []);
    setNote(result.generelKommentar || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-ink bg-panel p-3 mb-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink flex items-center gap-1.5"><Sparkles size={13} /> Foreslåede datoer</p>
        <button onClick={run} disabled={loading} className="text-muted hover:text-brand disabled:opacity-50" title="Opdater forslag">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && <p className="text-xs text-muted">Analyserer ugens ruter og adresser...</p>}
      {error && <p className="text-xs text-danger">{error}</p>}

      {!loading && !error && suggestions?.length > 0 && (
        <div className="space-y-1.5 mt-1">
          {suggestions.map((s, i) => {
            const technician = technicians.find((m) => m.navn === s.montorNavn);
            return (
              <button
                key={i}
                onClick={() => onSelectDate(s.dato, technician ? technician.id : null)}
                className="w-full text-left rounded-lg bg-white border border-line hover:border-brand transition-colors px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{formatLongDate(s.dato)}</span>
                  {technician && <span className="text-[10px] font-mono text-muted shrink-0">{technician.navn}</span>}
                </div>
                {s.begrundelse && <p className="text-[11px] text-muted mt-0.5">{s.begrundelse}</p>}
              </button>
            );
          })}
        </div>
      )}
      {!loading && !error && suggestions?.length === 0 && (
        <p className="text-xs text-muted">Intet specifikt forslag ud fra ugens data — vælg selv nedenfor.</p>
      )}
      {note && <p className="text-[11px] text-muted italic mt-2">{note}</p>}

      <button onClick={() => setShowDetails((v) => !v)} className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink mt-3 pt-2 border-t border-divider">
        Se ugens kapacitet i detaljer
        <ChevronDown size={14} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>
      {showDetails && <div className="mt-2"><WeeklyScheduleOverview orders={orders} technicians={technicians} date={date} /></div>}

      <p className="text-[10px] text-muted mt-2">Forslag ud fra samme opgang, køreafstand og ugens kapacitet — et forslag, ikke en automatisk booking. Tryk på et forslag for at bruge det.</p>
    </div>
  );
}

export { LineItemEditor, KeyAccessFields, CustomerHistory, SuggestedDates, InteractiveWeekPicker };
