// DAGENS HOLD (oktober 2026): hvilken medhjælper kører med hvilken bil den valgte dag. Systemet FORESLÅR (lib/holdForslag.js), og en
// planlægger godkender eller retter, før det gemmes (day_helpers). Intet gemmes af sig selv.
import React from "react";
import { Users, Wand2, Check } from "lucide-react";
import { foreslaaHold, manglerTekst } from "../lib/holdForslag";
import { arbejderDenDag } from "../lib/dagsplan";

const AARSAG = { fast: "fast makker", forslag: "forslag", laast: "godkendt" };

export function DagensHold({ dato, orders, technicians, personnel, timeOff, kapGrundlag, crew, onSave }) {
  const grundlag = kapGrundlag && !kapGrundlag.fejl ? kapGrundlag : {};
  const arbejder = (p) => arbejderDenDag({ dato, personId: p.id, timeOff, arbejdstider: grundlag.arbejdstider, uaendringer: grundlag.uaendringer, indstillinger: grundlag.indstillinger }).arbejder;

  const gemt = React.useMemo(
    () => crew.helpers.filter((h) => h.dato === dato).map((h) => ({ personId: h.personId, vehicleId: h.vehicleId })),
    [crew.helpers, dato]
  );
  const [kladde, setKladde] = React.useState(gemt);
  const [aarsager, setAarsager] = React.useState({});
  const [mangler, setMangler] = React.useState([]);
  const [status, setStatus] = React.useState({ type: "", tekst: "" });
  const [gemmer, setGemmer] = React.useState(false);
  // Skift af dag, eller nye gemte data udefra, nulstiller kladden til det gemte.
  React.useEffect(() => { setKladde(gemt); setAarsager({}); setMangler([]); setStatus({ type: "", tekst: "" }); }, [gemt]);

  const alleHjaelpere = personnel.filter((p) => p.rolle === "medhjaelper");
  const ledigeHjaelpere = alleHjaelpere.filter(arbejder);
  const biler = technicians
    .map((t) => {
      const dagensSager = orders.filter((o) => o.bilId === t.id && o.dato === dato && o.status !== "afsluttet");
      const montoerIds = personnel.filter((p) => p.rolle !== "medhjaelper" && p.bilId === t.id).filter(arbejder).map((p) => p.id);
      return { id: t.id, navn: t.navn, montoerIds, stop: dagensSager.length, toMandStop: dagensSager.filter((o) => o.toMand).length };
    })
    .filter((b) => b.stop > 0 || kladde.some((k) => k.vehicleId === b.id));

  if (alleHjaelpere.length === 0 || biler.length === 0) return null;

  const hjNavn = (id) => alleHjaelpere.find((h) => h.id === id)?.navn || "Ukendt";
  const paaBil = (bilId) => kladde.find((k) => k.vehicleId === bilId)?.personId || "";
  const sat = (bilId, personId) => setKladde((k) => {
    const uden = k.filter((x) => x.vehicleId !== bilId && x.personId !== personId);
    return personId ? [...uden, { personId, vehicleId: bilId }] : uden;
  });
  const aendret = JSON.stringify([...kladde].sort((a, b) => a.personId.localeCompare(b.personId))) !== JSON.stringify([...gemt].sort((a, b) => a.personId.localeCompare(b.personId)));

  const foreslaa = () => {
    const alene = new Set(crew.solo);
    const r = foreslaaHold({
      biler,
      hjaelpere: ledigeHjaelpere.map((h) => ({ id: h.id, navn: h.navn })),
      faste: crew.pairs, alene: [...alene],
      historik: crew.helpers.filter((h) => h.dato < dato),
    });
    setKladde(r.tildelinger.map((t) => ({ personId: t.personId, vehicleId: t.vehicleId })));
    setAarsager(Object.fromEntries(r.tildelinger.map((t) => [t.vehicleId, t.aarsag])));
    setMangler(r.mangler);
    setStatus({ type: "info", tekst: r.tildelinger.length === 0 && r.mangler.length === 0 ? "Ingen ture har brug for en medhjælper denne dag." : "Forslag klar — ret om nødvendigt, og tryk Gem." });
  };

  const gem = async () => {
    setGemmer(true);
    const ok = await onSave(dato, kladde);
    setGemmer(false);
    setStatus(ok === false ? { type: "fejl", tekst: "Holdet blev ikke gemt. Prøv igen." } : { type: "ok", tekst: "Dagens hold er gemt." });
  };

  const fraværende = kladde.filter((k) => !ledigeHjaelpere.some((h) => h.id === k.personId));
  const manglerBil = (b) => b.toMandStop > 0 && !paaBil(b.id) && b.montoerIds.length < 2;

  return (
    <section className="border-b border-divider px-3 py-3" aria-label="Dagens hold">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink flex items-center gap-1.5 flex-1 min-w-0"><Users size={14} className="text-brand shrink-0" aria-hidden="true" /> Medhjælpere denne dag</h3>
        <button onClick={foreslaa} className="h-10 px-3 rounded-lg border border-brand text-brand text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 hover:bg-brand/10 focus:outline-none focus:ring-2 focus:ring-brand">
          <Wand2 size={13} aria-hidden="true" /> Foreslå hold
        </button>
        <button onClick={gem} disabled={!aendret || gemmer} className="h-10 px-3 rounded-lg bg-brand text-white text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ink disabled:opacity-50 disabled:pointer-events-none">
          <Check size={13} aria-hidden="true" /> {gemmer ? "Gemmer..." : "Gem"}
        </button>
      </div>
      <div className="space-y-1.5">
        {biler.map((b) => {
          const valgt = paaBil(b.id);
          return (
            <div key={b.id} className="flex items-center gap-2 flex-wrap rounded-lg bg-panel border border-line px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">{b.navn}</p>
                <p className="text-[11px] text-muted">
                  {b.stop} {b.stop === 1 ? "sag" : "sager"}{b.toMandStop > 0 ? ` · ${b.toMandStop} kræver to mand` : ""}
                  {valgt && aarsager[b.id] ? ` · ${AARSAG[aarsager[b.id]]}` : ""}
                </p>
                {manglerBil(b) && <p role="alert" className="text-[11px] text-danger font-semibold">Mangler medhjælper til to-mands-opgave</p>}
              </div>
              <select
                value={valgt}
                onChange={(e) => { sat(b.id, e.target.value); setStatus({ type: "", tekst: "" }); }}
                aria-label={`Medhjælper på ${b.navn}`}
                className="h-10 rounded-lg border border-line bg-white px-2 text-xs text-ink focus:outline-none focus:border-brand"
              >
                <option value="">Ingen medhjælper</option>
                {alleHjaelpere.map((h) => {
                  const ledig = ledigeHjaelpere.some((x) => x.id === h.id);
                  const andenBil = kladde.some((k) => k.personId === h.id && k.vehicleId !== b.id);
                  return <option key={h.id} value={h.id} disabled={!ledig && h.id !== valgt}>{h.navn}{!ledig ? " (ikke på arbejde)" : andenBil ? " (flyttes hertil)" : ""}</option>;
                })}
              </select>
            </div>
          );
        })}
      </div>
      {mangler.map((m) => <p key={m.vehicleId} role="alert" className="text-[11px] text-danger mt-1.5">{biler.find((b) => b.id === m.vehicleId)?.navn}: {manglerTekst(m.aarsag)}.</p>)}
      {fraværende.length > 0 && <p role="alert" className="text-[11px] text-danger mt-1.5">{fraværende.map((k) => hjNavn(k.personId)).join(", ")} er ikke på arbejde denne dag, men står på holdet.</p>}
      {status.tekst && <p role="status" className={`text-[11px] mt-1.5 ${status.type === "fejl" ? "text-danger" : status.type === "ok" ? "text-success" : "text-muted"}`}>{status.tekst}</p>}
    </section>
  );
}
