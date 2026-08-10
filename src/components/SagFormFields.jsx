import React, { useState } from "react";
import { Trash2, X, Plus, AlertCircle, KeyRound, Clock, Truck, MapPin } from "lucide-react";
import { OTHER_PRODUCT_TYPE as ANDET_VARETYPE, OTHER_PRODUCT_TYPE_ID as ANDET_VARETYPE_ID, KEY_ACCESS_TYPES as NOEGLE_TYPER, buildingKey as bygningsNoegle, formatLongDate as formatDatoLang, formatDuration as formatVarighed, lineItemMinutes as linjeMinutter, availableAddOns as tilgaengeligeTillaeg, serviceIcon as ydelseIkon } from "../data/domain";

function VarelinjeRedigering({ linje, varetyper, varekategorier, primaerydelser, tillaegsydelser, onChange, onFjern, kanFjerne }) {
  const erAndet = linje.varetypeId === ANDET_VARETYPE_ID;
  const valgtVaretype = varetyper.find((v) => v.id === linje.varetypeId);
  const [kategoriFilter, setKategoriFilter] = useState(valgtVaretype?.kategoriId || "");

  const synligeVaretyper = kategoriFilter ? varetyper.filter((v) => v.kategoriId === kategoriFilter) : varetyper;
  const tilgaengelig = tilgaengeligeTillaeg(linje.varetypeId, linje.primaerYdelse?.id, tillaegsydelser);

  const skiftVaretype = (nyId) => {
    if (nyId === linje.varetypeId) return;
    const vt = nyId === ANDET_VARETYPE_ID ? null : varetyper.find((v) => v.id === nyId);
    const nyTilgaengelig = tilgaengeligeTillaeg(nyId, linje.primaerYdelse?.id, tillaegsydelser);
    onChange({
      ...linje,
      varetypeId: nyId,
      varetypeNavn: vt ? vt.navn : ANDET_VARETYPE,
      varetypeTekst: "",
      tillaeg: linje.tillaeg.filter((t) => nyTilgaengelig.some((n) => n.navn === t.navn)),
    });
  };

  const skiftPrimaerYdelse = (nyId) => {
    const py = primaerydelser.find((p) => p.id === nyId);
    if (!py) return;
    const nyTilgaengelig = tilgaengeligeTillaeg(linje.varetypeId, nyId, tillaegsydelser);
    onChange({
      ...linje,
      primaerYdelse: { id: py.id, navn: py.navn, minutter: Number(py.minutter) || 0 },
      tillaeg: linje.tillaeg.filter((t) => nyTilgaengelig.some((n) => n.navn === t.navn)),
    });
  };

  const skiftPrimaerYdelseMinutter = (min) => onChange({ ...linje, primaerYdelse: { ...linje.primaerYdelse, minutter: Number(min) || 0 } });

  const toggleTillaeg = (t) => {
    const findes = linje.tillaeg.some((x) => x.id === t.id || x.navn === t.navn);
    if (findes) {
      onChange({ ...linje, tillaeg: linje.tillaeg.filter((x) => x.id !== t.id && x.navn !== t.navn) });
    } else {
      onChange({ ...linje, tillaeg: [...linje.tillaeg, { id: t.id, navn: t.navn, minutter: Number(t.minutter) || 0, udfoert: false }] });
    }
  };
  const toggleUdfoert = (id) => onChange({ ...linje, tillaeg: linje.tillaeg.map((y) => (y.id === id ? { ...y, udfoert: !y.udfoert } : y)) });
  const skiftTillaegMinutter = (id, min) => onChange({ ...linje, tillaeg: linje.tillaeg.map((y) => (y.id === id ? { ...y, minutter: Number(min) || 0 } : y)) });

  return (
    <div className="border border-[#D8D0BE] bg-[#FCFAF4] p-3">
      <div className="grid gap-2 sm:grid-cols-3 mb-2">
        <select value={kategoriFilter} onChange={(e) => setKategoriFilter(e.target.value)} className="border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          <option value="">Alle kategorier</option>
          {varekategorier.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
        </select>
        <select value={linje.varetypeId} onChange={(e) => skiftVaretype(e.target.value)} className="border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
          {synligeVaretyper.map((v) => <option key={v.id} value={v.id}>{v.navn}</option>)}
          <option value={ANDET_VARETYPE_ID}>{ANDET_VARETYPE}</option>
        </select>
        <div className="flex items-center gap-1.5">
          <select value={linje.primaerYdelse?.id || ""} onChange={(e) => skiftPrimaerYdelse(e.target.value)} className="flex-1 border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            {primaerydelser.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
          </select>
          {kanFjerne && <button onClick={onFjern} className="p-1.5 text-[#52697E] hover:text-[#B3261E] shrink-0" title="Fjern varelinje"><Trash2 size={15} /></button>}
        </div>
      </div>

      {erAndet && (
        <input
          value={linje.varetypeTekst}
          onChange={(e) => onChange({ ...linje, varetypeTekst: e.target.value })}
          placeholder="Beskriv varen/opgaven, fx 'Specialbygget vinkøleskab'"
          className="w-full border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] mb-2 focus:outline-none focus:border-[#E2621B]"
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2 mb-2">
        <input value={linje.maerke} onChange={(e) => onChange({ ...linje, maerke: e.target.value })} placeholder="Mærke, fx 'Bosch'" className="border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={linje.model} onChange={(e) => onChange({ ...linje, model: e.target.value })} placeholder="Modelnummer" className="border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
      </div>

      <label className="flex items-center gap-2 mb-2 text-xs text-[#52697E]">
        <Clock size={12} className="shrink-0" />
        Estimeret tid til {linje.primaerYdelse?.navn?.toLowerCase() || "denne ydelse"}
        <input
          type="number" min="0"
          value={linje.primaerYdelse?.minutter ?? 0}
          onChange={(e) => skiftPrimaerYdelseMinutter(e.target.value)}
          className="w-16 border border-[#D8D0BE] bg-white px-2 py-1 text-right text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
        />
        min
      </label>

      {tilgaengelig.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wide text-[#52697E] mb-1">Tillægsydelser</p>
          <div className="flex flex-wrap gap-1.5">
            {tilgaengelig.map((t) => {
              const valgt = linje.tillaeg.find((x) => x.id === t.id || x.navn === t.navn);
              const Icon = ydelseIkon(t.navn);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTillaeg(t)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 border transition-colors ${valgt ? "border-[#3D7A5C] bg-[#3D7A5C10] text-[#3D7A5C]" : "border-[#D8D0BE] text-[#52697E] hover:border-[#E2621B] hover:text-[#E2621B]"}`}
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

      {linje.tillaeg.length > 0 && (
        <div className="space-y-1 mb-2 border-t border-[#F0EBDD] pt-2">
          {linje.tillaeg.map((y) => {
            const Icon = ydelseIkon(y.navn);
            return (
              <div key={y.id} className="flex items-center gap-2 px-1.5 py-1 hover:bg-white group">
                <input type="checkbox" checked={y.udfoert} onChange={() => toggleUdfoert(y.id)} className="w-4 h-4 accent-[#3D7A5C] shrink-0" title="Udført" />
                <Icon size={13} className="text-[#52697E] shrink-0" strokeWidth={2.5} />
                <span className="text-sm text-[#1C232E] flex-1 truncate">{y.navn}</span>
                <input
                  type="number" min="0"
                  value={y.minutter}
                  onChange={(e) => skiftTillaegMinutter(y.id, e.target.value)}
                  className="w-14 border border-[#D8D0BE] bg-white px-1.5 py-0.5 text-right text-[10px] text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
                  title="Estimeret tid for denne tillægsydelse"
                />
                <span className="text-[10px] text-[#52697E]">min</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-[#52697E] flex items-center gap-1"><Clock size={10} /> I alt for denne linje: {formatVarighed(linjeMinutter(linje))}</p>
    </div>
  );
}

function NoegleFelter({ noegle, onChange }) {
  return (
    <div className="border border-[#D8D0BE] bg-[#FCFAF4] p-3">
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <input type="checkbox" checked={noegle.kraeves} onChange={(e) => onChange({ ...noegle, kraeves: e.target.checked })} className="w-4 h-4 accent-[#E2621B]" />
        <KeyRound size={14} className="text-[#52697E]" />
        <span className="text-sm font-medium text-[#1C232E]">Kræver nøgle/adgang</span>
      </label>
      {noegle.kraeves && (
        <div className="grid gap-2 sm:grid-cols-2 pl-1">
          <select value={noegle.type} onChange={(e) => onChange({ ...noegle, type: e.target.value })} className="border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            <option value="">Vælg type</option>
            {NOEGLE_TYPER.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={noegle.detaljer} onChange={(e) => onChange({ ...noegle, detaljer: e.target.value })} placeholder="Detaljer, fx kode eller nøgleboks-nr." className="border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={noegle.placering} onChange={(e) => onChange({ ...noegle, placering: e.target.value })} placeholder="Placering, fx 'Ved hoveddøren bag lampen'" className="sm:col-span-2 border border-[#D8D0BE] bg-white px-2 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        </div>
      )}
    </div>
  );
}

function AdresseForslag({ adresse, dato, sager, onBrugDato }) {
  const noegle = bygningsNoegle(adresse);
  if (!noegle || adresse.trim().length < 5) return null;
  const matches = (sager || []).filter((s) => s.dato && s.dato !== dato && bygningsNoegle(s.kunde?.adresse) === noegle);
  if (matches.length === 0) return null;
  const datoer = [...new Set(matches.map((s) => s.dato))].sort();
  return (
    <div className="mb-3 border border-[#E2621B] bg-[#E2621B10] p-3">
      <p className="text-sm font-semibold text-[#E2621B] flex items-center gap-1.5"><AlertCircle size={14} /> Samme opgang/ejendom er allerede booket</p>
      <p className="text-xs text-[#52697E] mt-1">Der er allerede en sag på denne adresse på en anden dag — overvej at samle dem, så I ikke kører to gange til samme opgang:</p>
      <div className="mt-2 space-y-1">
        {datoer.map((d) => {
          const paaDenDag = matches.filter((s) => s.dato === d);
          return (
            <div key={d} className="bg-white border border-[#D8D0BE] px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[#1C232E]">{formatDatoLang(d)}</span>
                <button onClick={() => onBrugDato(d)} className="text-[10px] font-semibold uppercase tracking-wide text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B] px-2 py-1 shrink-0">Brug denne dato</button>
              </div>
              {paaDenDag.map((s) => (
                <p key={s.id} className="text-[11px] text-[#52697E] flex items-center gap-1 mt-0.5"><MapPin size={10} className="shrink-0" /> {s.kunde.navn} — {s.kunde.adresse}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Overblik over dagens allerede planlagte kørsler, grupperet pr. bil/montør
// - så sælgeren kan se med det samme hvem der kører hvor den valgte dag, og
// booke mere effektivt (fx lægge en ny sag hos en bil der alligevel er i
// området). Viser sig kun når der rent faktisk er noget booket den dag.
function DagensRuteoverblik({ sager, montorer, dato }) {
  if (!dato) return null;
  const dagensSager = (sager || []).filter((s) => s.dato === dato).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  if (dagensSager.length === 0) return null;

  const raekker = [{ id: null, navn: "Ikke tildelt endnu", bil: "" }, ...montorer]
    .map((m) => ({ ...m, sager: dagensSager.filter((s) => s.montorId === m.id) }))
    .filter((g) => g.sager.length > 0);

  return (
    <div className="mb-4 border border-[#D8D0BE] bg-[#FCFAF4] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#1C232E] mb-2.5 flex items-center gap-1.5">
        <Truck size={13} /> Dagens ruter — {formatDatoLang(dato)} <span className="font-mono text-[#52697E]">({dagensSager.length} sager)</span>
      </p>
      <div className="space-y-3">
        {raekker.map((g) => (
          <div key={g.id || "utildelt"}>
            <p className="text-[11px] font-semibold text-[#52697E] mb-1">
              {g.navn}{g.bil ? ` — ${g.bil}` : ""} <span className="font-mono">({g.sager.length})</span>
            </p>
            <div className="space-y-1">
              {g.sager.map((s) => (
                <div key={s.id} className="flex items-start gap-2 text-xs bg-white border border-[#D8D0BE] px-2 py-1.5">
                  <span className="font-mono text-[#52697E] shrink-0">{s.start}</span>
                  <span className="text-[#1C232E] shrink-0 font-medium">{s.kunde?.navn}</span>
                  <span className="text-[#52697E] truncate flex items-center gap-1"><MapPin size={10} className="shrink-0" /> {s.kunde?.adresse}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { VarelinjeRedigering, NoegleFelter, AdresseForslag, DagensRuteoverblik };
