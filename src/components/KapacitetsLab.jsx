import React, { useState } from "react";
import { Loader2, AlertCircle, Check, Plus, Trash2, Play, MapPin } from "lucide-react";
import { planlaegDag, vurderTilfoejelse, rensIndstillinger, tilMin, tilHHMM, PERSONVAEGT_KG } from "../engine/kapacitet";
import { ors } from "../adapters";
import { geocodeAddress } from "../lib/geocoding";
import { hentKapacitetsIndstillinger } from "../lib/kapacitetStore";
import { getVehicles } from "../lib/dataStore";

// KAPACITETSMOTOREN - TESTLABORATORIUM (oktober 2026, kun systemadmin). Her kan motoren afprøves uden at røre rigtige sager: tast en bil, en
// besætning, et lager og en række stop med varer, og se hvordan den digitale disponent ville lægge dagen, hvorfor, og hvad der bryder reglerne.
// Intet gemmes. Et stop kan markeres som KANDIDAT: så vises det, hvad det koster at lægge netop dét stop oven i dagen (grundlaget for forslag
// ved booking). Koordinater kan slås op fra en adresse, eller tastes direkte.
const num = (v) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(",", ".")));
const felt = "rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink font-mono focus:outline-none focus:border-brand min-w-0";
const kort = "rounded-xl border border-line bg-white p-4 shadow-sm";
const lab = "block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1";
let nr = 0;
const nyVare = (o = {}) => ({ key: `v${++nr}`, navn: "", antal: "1", vaegt: "", l: "", b: "", h: "", ...o });
const nytStop = (o = {}) => ({ key: `s${++nr}`, navn: "", adresse: "", lat: "", lon: "", minutter: "60", tidsFra: "", tidsTil: "", to: false, kandidat: false, varer: [], ...o });

const EKSEMPEL = () => [
  nytStop({ navn: "Anna, Odense N", lat: "55.4300", lon: "10.4000", minutter: "40", varer: [nyVare({ navn: "Opvaskemaskine", antal: "2", vaegt: "40", l: "60", b: "60", h: "85" })] }),
  nytStop({ navn: "Bent, Bogense", lat: "55.5667", lon: "10.0833", minutter: "50", to: true, varer: [nyVare({ navn: "Køleskab", antal: "1", vaegt: "85", l: "70", b: "70", h: "185" })] }),
  nytStop({ navn: "Boligselskab, Kerteminde", lat: "55.4503", lon: "10.6572", minutter: "70", varer: [nyVare({ navn: "Kantsten", antal: "1", vaegt: "700", l: "120", b: "100", h: "80" })] }),
  nytStop({ navn: "Dorte, Kerteminde", lat: "55.4480", lon: "10.6600", minutter: "40", tidsFra: "08:00", tidsTil: "12:00", varer: [nyVare({ navn: "Vaskemaskine", antal: "1", vaegt: "70", l: "60", b: "60", h: "85" })] }),
];

function tilEngineStop(r) {
  const fra = tilMin(r.tidsFra); const til = tilMin(r.tidsTil);
  return {
    id: r.key, navn: r.navn || "Uden navn", adresse: r.adresse, lat: num(r.lat), lon: num(r.lon), minutter: num(r.minutter) ?? 0, kraever2Mand: !!r.to,
    tidsrum: fra !== null && til !== null ? { fra, til } : null,
    varer: r.varer.map((v) => ({ id: v.key, navn: v.navn || "Vare", type: v.navn, antal: num(v.antal) ?? 1, vaegtKg: num(v.vaegt), maal: num(v.l) && num(v.b) && num(v.h) ? { l: num(v.l), b: num(v.b), h: num(v.h) } : null })),
  };
}

function Resultat({ res, navne }) {
  const sted = (id) => (id === "lager" ? "Lager" : navne[id] || id);
  const tekst = (h) => {
    switch (h.type) {
      case "laes": return "Læsning af bilen på lageret";
      case "koersel": return `Kørsel ${sted(h.fraSted)} → ${sted(h.tilSted)} (${h.km} km)`;
      case "stop": return `${h.navn}${h.adresse ? `, ${h.adresse}` : ""}${h.kraever2Mand ? " · to mand" : ""}${h.varer?.length ? ` · ${h.varer.length} vare(r)` : ""}`;
      case "omlastning": return `Omlastning på lageret (tur ${h.tur})`;
      case "pause": return "Pause";
      case "vent": return `Venter - ${h.aarsag}`;
      case "hjem": return "Hjemme: tømning af bilen";
      default: return h.type;
    }
  };
  const n = res.noegletal;
  return (
    <div className="space-y-4">
      <div className={`${kort} ${res.ok ? "border-success" : "border-danger"}`}>
        <p className={`text-sm font-semibold flex items-center gap-1.5 ${res.ok ? "text-success" : "text-danger"}`}>
          {res.ok ? <Check size={15} aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />} {res.ok ? "Dagen kan lade sig gøre" : "Dagen bryder et krav"}
        </p>
        {n && n.hjemmeKl && (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
            {[["Hjemme kl.", n.hjemmeKl], ["Kørsel", `${n.km} km / ${n.koerselMin} min`], ["Arbejde", `${n.arbejdeMin} min`], ["Ventetid", `${n.venteMin} min`], ["Omlastninger", n.omlastninger], ["Ledig tid", `${n.ledigMin} min`], ["Omkostning", `${n.omkostningKr} kr`], ["Ture", res.ture.length]].map(([k, v]) => (
              <div key={k}><dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt><dd className="font-mono text-ink">{v}</dd></div>
            ))}
          </dl>
        )}
      </div>

      {(res.brud.length > 0 || res.advarsler.length > 0) && (
        <div className={kort}>
          {res.brud.map((b, i) => <p key={`b${i}`} className="text-sm text-danger flex items-start gap-1.5 mb-1"><AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> <span><strong>Brud ({b.regel}):</strong> {b.besked}</span></p>)}
          {res.advarsler.map((b, i) => <p key={`a${i}`} className="text-sm text-brand flex items-start gap-1.5 mb-1"><AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" /> <span><strong>Advarsel ({b.regel}):</strong> {b.besked}</span></p>)}
        </div>
      )}

      {res.haendelser.length > 0 && (
        <div className={kort}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink mb-2">Dagen</h4>
          <ol className="text-sm">
            {res.haendelser.map((h, i) => (
              <li key={i} className={`flex gap-3 py-1 border-b border-divider last:border-0 ${h.type === "stop" ? "font-semibold text-ink" : "text-muted"}`}>
                <span className="font-mono w-28 shrink-0">{tilHHMM(h.fra)}–{tilHHMM(h.til)}</span><span>{tekst(h)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {res.ture.length > 0 && (
        <div className={kort}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink mb-2">Ture og last</h4>
          {res.ture.map((t) => (
            <div key={t.nr} className="text-sm mb-2">
              <p className="text-ink"><strong>Tur {t.nr}:</strong> {t.besoeg.map((b) => b.navn).join(" → ")}</p>
              <p className="text-muted text-xs font-mono">{t.vaegtKg} kg{t.tilladtKg !== null ? ` af ${t.tilladtKg} kg tilladt` : ""}{t.gulvPct !== null ? ` · gulv ${t.gulvPct} % brugt` : ""}</p>
              {t.pakning && t.pakning.ok && t.pakning.placeringer?.length > 0 && (
                <details className="text-xs text-muted"><summary className="cursor-pointer">Pakkeplan</summary>
                  <ul className="font-mono">{t.pakning.placeringer.map((p) => <li key={p.id}>{p.id}: {p.paa ? `oven på ${p.paa}` : `gulv ${Math.round(p.x)},${Math.round(p.y)} cm`}</li>)}</ul></details>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={kort}>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink mb-2">Hvorfor</h4>
        <ul className="text-sm text-ink list-disc pl-5 space-y-1">{res.forklaring.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <details className="text-xs text-muted mt-3"><summary className="cursor-pointer">Forudsætninger og rå data</summary>
          <pre className="whitespace-pre-wrap break-all mt-2 bg-panel border border-line rounded-lg p-2 max-h-72 overflow-y-auto">{JSON.stringify({ forudsaetninger: res.forudsaetninger, noegletal: res.noegletal }, null, 2)}</pre></details>
      </div>
    </div>
  );
}

function KapacitetsLab({ stores = [] }) {
  const [bil, setBil] = useState({ nyttelastKg: "1200", vaerktoejKg: "80", l: "380", b: "170", h: "200", tempo: "100" });
  const [crew, setCrew] = useState({ start: "08:00", slut: "16:00", pause: "30", medhjaelper: true });
  const [lager, setLager] = useState({ lat: "55.4038", lon: "10.4024" });
  const [stop, setStop] = useState(() => EKSEMPEL());
  const [indTekst, setIndTekst] = useState(() => JSON.stringify(rensIndstillinger({}), null, 2));
  const [dato] = useState("2026-11-09");
  const [brugOrs, setBrugOrs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [note, setNote] = useState("");
  const [res, setRes] = useState(null);
  const [vurdering, setVurdering] = useState(null);
  const [butik, setButik] = useState("");
  const [biler, setBiler] = useState([]);

  const sætStop = (key, felter) => setStop((p) => p.map((s) => (s.key === key ? { ...s, ...felter } : s)));
  const sætVare = (key, vk, felter) => setStop((p) => p.map((s) => (s.key === key ? { ...s, varer: s.varer.map((v) => (v.key === vk ? { ...v, ...felter } : v)) } : s)));

  const indlaesButik = async (id) => {
    setButik(id); setBiler([]);
    if (!id) return;
    const [ind, b] = await Promise.all([hentKapacitetsIndstillinger(id), getVehicles(id)]);
    if (ind) setIndTekst(JSON.stringify(ind, null, 2));
    setBiler(b || []);
    setNote(ind ? "Butikkens indstillinger er indlæst." : "Butikkens indstillinger kunne ikke hentes.");
  };
  const vaelgBil = (id) => {
    const b = biler.find((x) => x.id === id);
    if (!b) return;
    setBil({ nyttelastKg: String(b.nyttelastKg ?? ""), vaerktoejKg: String(b.vaerktoejKg ?? ""), l: String(b.lasterum?.laengdeCm ?? ""), b: String(b.lasterum?.breddeCm ?? ""), h: String(b.lasterum?.hoejdeCm ?? ""), tempo: String(b.tempo ?? 100) });
  };
  const findAdresse = async (s) => {
    const k = await geocodeAddress(s.adresse);
    if (k) sætStop(s.key, { lat: String(k.lat), lon: String(k.lon) }); else setFejl(`Adressen "${s.adresse}" blev ikke fundet.`);
  };

  const koer = async () => {
    setFejl(""); setNote(""); setRes(null); setVurdering(null);
    let ind;
    try { ind = JSON.parse(indTekst); } catch (_) { return setFejl("Indstillingerne er ikke gyldig JSON."); }
    const kand = stop.filter((s) => s.kandidat);
    if (kand.length > 1) return setFejl("Vælg højst ét stop som kandidat.");
    const a = tilMin(crew.start); const b = tilMin(crew.slut);
    if (a === null || b === null || b <= a) return setFejl("Besætningens arbejdstid er ugyldig.");
    setBusy(true);
    const alle = stop.map(tilEngineStop);
    const lagerP = { id: "lager", lat: num(lager.lat), lon: num(lager.lon) };
    let matrix;
    if (brugOrs) {
      const punkter = [lagerP, ...alle.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)).map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }))];
      try { matrix = await ors.koerselsmatrix(punkter); } catch (_) { matrix = null; }
      if (!matrix) setNote("Ruteopslag (ORS) var ikke tilgængeligt - køretiden er et skøn ud fra luftlinje.");
    }
    const personer = [{ id: "m", navn: "Montør", rolle: "montoer", vinduer: [{ fra: a, til: b }] }];
    if (crew.medhjaelper) personer.push({ id: "h", navn: "Medhjælper", rolle: "medhjaelper", vinduer: [{ fra: a, til: b }] });
    const input = {
      dato, indstillinger: ind, lager: lagerP, pauseMin: num(crew.pause) ?? 0, personer, matrix: matrix || undefined,
      bil: { id: "lab", navn: "Testbil", tempo: num(bil.tempo) || 100, nyttelastKg: num(bil.nyttelastKg), vaerktoejKg: num(bil.vaerktoejKg) || 0, lasterum: num(bil.l) && num(bil.b) && num(bil.h) ? { laengdeCm: num(bil.l), breddeCm: num(bil.b), hoejdeCm: num(bil.h) } : null },
      stop: alle.filter((_, i) => !stop[i].kandidat),
    };
    try {
      if (kand.length === 1) { const kStop = alle[stop.findIndex((s) => s.kandidat)]; const v = vurderTilfoejelse(input, kStop); setVurdering(v); setRes(v.efter); }
      else setRes(planlaegDag(input));
    } catch (e) { setFejl(`Motoren fejlede: ${e?.message || e}`); }
    setBusy(false);
  };

  const navne = Object.fromEntries(stop.map((s) => [s.key, s.navn || "Uden navn"]));
  const tal = (st, k, label, bredde = "w-20") => (<div><label className={lab}>{label}</label><input aria-label={label} className={`${felt} ${bredde}`} value={st[0][k]} onChange={(e) => st[1]((p) => ({ ...p, [k]: e.target.value }))} /></div>);

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Kapacitetsmotor - testlaboratorium</h3>
      <p className="text-xs text-muted mb-4">Afprøv den digitale disponent uden at røre rigtige sager. Intet gemmes. Personer i bilen regnes med {PERSONVAEGT_KG} kg hver (fast). Markér ét stop som <strong>kandidat</strong> for at se, hvad det koster at lægge netop det stop oven i dagen.</p>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <div className={kort}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink mb-3">Bil</h4>
          {stores.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              <select aria-label="Indlæs fra butik" value={butik} onChange={(e) => indlaesButik(e.target.value)} className={`${felt} font-sans`}><option value="">Indlæs fra butik...</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.navn}</option>)}</select>
              {biler.length > 0 && <select aria-label="Vælg bil" onChange={(e) => vaelgBil(e.target.value)} className={`${felt} font-sans`} defaultValue=""><option value="">Vælg bil...</option>{biler.map((b) => <option key={b.id} value={b.id}>{b.navn}</option>)}</select>}
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            {tal([bil, setBil], "nyttelastKg", "Nyttelast kg")}{tal([bil, setBil], "vaerktoejKg", "Værktøj kg")}{tal([bil, setBil], "tempo", "Tempo %")}
            {tal([bil, setBil], "l", "Længde cm")}{tal([bil, setBil], "b", "Bredde cm")}{tal([bil, setBil], "h", "Højde cm")}
          </div>
        </div>
        <div className={kort}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink mb-3">Besætning og lager</h4>
          <div className="flex gap-3 flex-wrap items-end">
            <div><label className={lab}>Start</label><input aria-label="Start" type="time" className={felt} value={crew.start} onChange={(e) => setCrew((p) => ({ ...p, start: e.target.value }))} /></div>
            <div><label className={lab}>Slut</label><input aria-label="Slut" type="time" className={felt} value={crew.slut} onChange={(e) => setCrew((p) => ({ ...p, slut: e.target.value }))} /></div>
            {tal([crew, setCrew], "pause", "Pause min")}
            <label className="flex items-center gap-2 min-h-[44px] text-sm text-ink"><input type="checkbox" checked={crew.medhjaelper} onChange={(e) => setCrew((p) => ({ ...p, medhjaelper: e.target.checked }))} className="w-5 h-5 accent-brand" /> Medhjælper med</label>
          </div>
          <div className="flex gap-3 flex-wrap mt-3">{tal([lager, setLager], "lat", "Lager bredde", "w-28")}{tal([lager, setLager], "lon", "Lager længde", "w-28")}</div>
        </div>
      </div>

      <div className={`${kort} mb-4`}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">Stop</h4>
          <div className="flex gap-2">
            <button onClick={() => setStop(EKSEMPEL())} className="min-h-[44px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand">Indlæs eksempel</button>
            <button onClick={() => setStop((p) => [...p, nytStop()])} className="min-h-[44px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand flex items-center gap-1"><Plus size={13} aria-hidden="true" /> Stop</button>
          </div>
        </div>
        <div className="space-y-3">
          {stop.map((s, i) => (
            <div key={s.key} className={`rounded-lg border p-3 ${s.kandidat ? "border-brand bg-brand/5" : "border-line"}`}>
              <div className="flex gap-2 flex-wrap items-end">
                <div><label className={lab}>Navn</label><input aria-label={`Navn ${i + 1}`} className={`${felt} w-44`} value={s.navn} onChange={(e) => sætStop(s.key, { navn: e.target.value })} /></div>
                <div><label className={lab}>Adresse</label><div className="flex gap-1"><input aria-label={`Adresse ${i + 1}`} className={`${felt} w-44`} value={s.adresse} onChange={(e) => sætStop(s.key, { adresse: e.target.value })} /><button onClick={() => findAdresse(s)} aria-label={`Find koordinater ${i + 1}`} className="w-9 h-9 flex items-center justify-center rounded-lg border border-line text-muted hover:text-brand"><MapPin size={14} aria-hidden="true" /></button></div></div>
                <div><label className={lab}>Bredde</label><input aria-label={`Bredde ${i + 1}`} className={`${felt} w-24`} value={s.lat} onChange={(e) => sætStop(s.key, { lat: e.target.value })} /></div>
                <div><label className={lab}>Længde</label><input aria-label={`Længde ${i + 1}`} className={`${felt} w-24`} value={s.lon} onChange={(e) => sætStop(s.key, { lon: e.target.value })} /></div>
                <div><label className={lab}>Min</label><input aria-label={`Minutter ${i + 1}`} className={`${felt} w-16`} value={s.minutter} onChange={(e) => sætStop(s.key, { minutter: e.target.value })} /></div>
                <div><label className={lab}>Tidsrum fra</label><input aria-label={`Tidsrum fra ${i + 1}`} type="time" className={felt} value={s.tidsFra} onChange={(e) => sætStop(s.key, { tidsFra: e.target.value })} /></div>
                <div><label className={lab}>til</label><input aria-label={`Tidsrum til ${i + 1}`} type="time" className={felt} value={s.tidsTil} onChange={(e) => sætStop(s.key, { tidsTil: e.target.value })} /></div>
                <label className="flex items-center gap-1.5 min-h-[44px] text-xs text-ink"><input type="checkbox" checked={s.to} onChange={(e) => sætStop(s.key, { to: e.target.checked })} className="w-5 h-5 accent-brand" aria-label={`To mand ${i + 1}`} /> To mand</label>
                <label className="flex items-center gap-1.5 min-h-[44px] text-xs text-ink"><input type="checkbox" checked={s.kandidat} onChange={(e) => sætStop(s.key, { kandidat: e.target.checked })} className="w-5 h-5 accent-brand" aria-label={`Kandidat ${i + 1}`} /> Kandidat</label>
                <button onClick={() => setStop((p) => p.filter((x) => x.key !== s.key))} aria-label={`Fjern stop ${i + 1}`} className="w-11 h-11 flex items-center justify-center text-muted hover:text-danger"><Trash2 size={15} aria-hidden="true" /></button>
              </div>
              <div className="mt-2 space-y-1">
                {s.varer.map((v, j) => (
                  <div key={v.key} className="flex gap-2 flex-wrap items-center">
                    <input aria-label={`Vare ${i + 1}.${j + 1}`} placeholder="Vare (fx Køleskab)" className={`${felt} w-40`} value={v.navn} onChange={(e) => sætVare(s.key, v.key, { navn: e.target.value })} />
                    {[["antal", "Antal", "w-14"], ["vaegt", "kg", "w-16"], ["l", "L cm", "w-16"], ["b", "B cm", "w-16"], ["h", "H cm", "w-16"]].map(([k, p, w]) => (
                      <input key={k} aria-label={`${p} ${i + 1}.${j + 1}`} placeholder={p} className={`${felt} ${w}`} value={v[k]} onChange={(e) => sætVare(s.key, v.key, { [k]: e.target.value })} />
                    ))}
                    <button onClick={() => sætStop(s.key, { varer: s.varer.filter((x) => x.key !== v.key) })} aria-label={`Fjern vare ${i + 1}.${j + 1}`} className="w-9 h-9 flex items-center justify-center text-muted hover:text-danger"><Trash2 size={13} aria-hidden="true" /></button>
                  </div>
                ))}
                <button onClick={() => sætStop(s.key, { varer: [...s.varer, nyVare()] })} className="text-[11px] font-semibold uppercase tracking-wide text-brand hover:underline min-h-[36px]">+ vare</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <details className={`${kort} mb-4`}><summary className="text-xs font-semibold uppercase tracking-wide text-ink cursor-pointer">Indstillinger (JSON - samme som Admin → Kapacitet)</summary>
        <textarea aria-label="Indstillinger som JSON" value={indTekst} onChange={(e) => setIndTekst(e.target.value)} rows={14} className={`${felt} w-full mt-3`} /></details>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <button onClick={koer} disabled={busy} className="min-h-[44px] px-5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} Beregn dagen
        </button>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={brugOrs} onChange={(e) => setBrugOrs(e.target.checked)} className="accent-brand" /> Brug rigtig køretid (ORS)</label>
      </div>
      {fejl && <p role="alert" className="text-xs text-danger mb-3 flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> {fejl}</p>}
      {note && <p role="status" className="text-xs text-muted mb-3">{note}</p>}

      {vurdering && (
        <div className={`${kort} mb-4 ${vurdering.mulig ? "border-success" : "border-danger"}`}>
          <p className={`text-sm font-semibold ${vurdering.mulig ? "text-success" : "text-danger"}`}>{vurdering.mulig ? "Kandidaten kan lægges på dagen" : "Kandidaten kan IKKE lægges på dagen"}</p>
          {vurdering.ekstra && <p className="text-sm text-ink mt-1 font-mono">Ekstra: {vurdering.ekstra.min} min · {vurdering.ekstra.km} km · {vurdering.ekstra.kr} kr · {vurdering.ekstra.omlastninger} omlastning(er)</p>}
          {vurdering.aarsager.map((a, i) => <p key={i} className="text-xs text-danger mt-1">{a}</p>)}
        </div>
      )}
      {res && <Resultat res={res} navne={navne} />}
    </div>
  );
}

export { KapacitetsLab };
