import React, { useEffect, useMemo, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { lineItemLabel, formatLongDate, isMissingActive, isTechnicianAbsent, dailyOrderCompare } from "../data/domain";
import { linjeSkalPlukkes } from "../lib/ydelser";
import { pakkelisteData, sagerPaaTuren } from "../lib/pakkeliste";
import { bilNavnUdenHold } from "../lib/forsideTal";
import { rmaLabelsTilSager } from "../lib/rma";
import { erMedhjaelperRolle } from "../data/roller";
import { ETIKET_FORMATER, findFormat, tilpasFormat, sideCss, labelNiveau, labelsPrSide, laesLabelIndstillinger, gemLabelIndstillinger } from "../lib/udskrift";
import { udskriv } from "./Udskriv";
import { RmaLabel, LabelSider, PakkelisteDokument } from "./UdskriftDokumenter";

// UDSKRIFTSDIALOGER (oktober 2026): pakkeliste (komplet eller pr. bil) og RMA-labels. Udskrift sker via browserens print-dialog (components/Udskriv.jsx).

const felt = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
const knap = "min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand transition-colors";
const PX_PR_MM = 3.78;

function Ramme({ titel, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const taste = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-3 no-print">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titel} className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-xl bg-white border border-line shadow-lg p-4 focus:outline-none">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink flex items-center gap-2"><Printer size={16} className="text-brand" aria-hidden="true" /> {titel}</h2>
          <button type="button" onClick={onClose} aria-label="Luk" className="w-11 h-11 -m-2 flex items-center justify-center rounded-lg text-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand"><X size={16} aria-hidden="true" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Valg af label-format, egne mål, startplads på arket og antal kopier. Valget huskes på enheden.
function LabelValg({ vaerdi, onChange }) {
  const egen = useMemo(() => tilpasFormat(vaerdi.egen), [vaerdi.egen]);
  const format = findFormat(vaerdi.formatId, egen) || findFormat("ark-l7163");
  const sæt = (d) => onChange({ ...vaerdi, ...d });
  const sætEgen = (d) => sæt({ egen: { ...vaerdi.egen, ...d } });
  const grupper = [...new Set(ETIKET_FORMATER.map((f) => f.gruppe))];
  const eksempel = { nr: "RMA-26-223-1", kunde: "Erik Hansen", sag: "#26-223", vare: "Køleskab – Bosch KGN39", serienr: "FD 9912 0457", aarsag: "Støjer", butik: "Din butik", dato: "2026-10-27" };
  const skala = format ? Math.min(1, 280 / (format.b * PX_PR_MM), 160 / (format.h * PX_PR_MM)) : 1;
  const tal = (id, label, v, k, extra = {}) => (
    <label key={id} className="block text-xs text-muted">{label}
      <input inputMode="decimal" value={v} onChange={(e) => sætEgen({ [k]: e.target.value })} className={`${felt} mt-1`} {...extra} />
    </label>
  );
  return (
    <div className="space-y-3">
      <label className="block text-xs text-muted">Label-størrelse
        <select value={vaerdi.formatId} onChange={(e) => sæt({ formatId: e.target.value })} className={`${felt} mt-1 min-h-[44px]`}>
          {grupper.map((g) => <optgroup key={g} label={g}>{ETIKET_FORMATER.filter((f) => f.gruppe === g).map((f) => <option key={f.id} value={f.id}>{f.navn}</option>)}</optgroup>)}
          <option value="tilpasset">Egne mål …</option>
        </select>
      </label>
      {vaerdi.formatId === "tilpasset" && (
        <div className="rounded-lg border border-line p-3 space-y-2">
          <div className="flex gap-2" role="group" aria-label="Type">
            {[["ark", "Ark (A4)"], ["rulle", "Rulle / enkelt label"]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={vaerdi.egen.type === k} onClick={() => sætEgen({ type: k })} className={`${knap} flex-1 border ${vaerdi.egen.type === k ? "bg-brand text-white border-brand" : "border-line text-muted"}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {tal("b", "Bredde (mm)", vaerdi.egen.b, "b")}{tal("h", "Højde (mm)", vaerdi.egen.h, "h")}
            {vaerdi.egen.type === "ark" && <>
              {tal("kol", "Kolonner", vaerdi.egen.kol, "kol")}{tal("raekker", "Rækker", vaerdi.egen.raekker, "raekker")}
              {tal("top", "Margen foroven (mm)", vaerdi.egen.top, "top")}{tal("venstre", "Margen til venstre (mm)", vaerdi.egen.venstre, "venstre")}
              {tal("gapX", "Mellemrum vandret (mm)", vaerdi.egen.gapX, "gapX")}{tal("gapY", "Mellemrum lodret (mm)", vaerdi.egen.gapY, "gapY")}
            </>}
          </div>
          {!egen && <p role="alert" className="text-xs text-danger">Målene passer ikke: tjek, at tallene er udfyldt, og at gitteret kan være på et A4-ark.</p>}
        </div>
      )}
      {format && format.type === "ark" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-muted">Første ledige plads på arket (1–{labelsPrSide(format)})
            <input type="number" min={1} max={labelsPrSide(format)} value={vaerdi.start} onChange={(e) => sæt({ start: Math.min(labelsPrSide(format), Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} className={`${felt} mt-1`} />
          </label>
          <label className="flex items-end gap-2 text-xs text-muted pb-2">
            <input type="checkbox" checked={vaerdi.rammer} onChange={(e) => sæt({ rammer: e.target.checked })} className="w-5 h-5 accent-brand" /> Tegn rammer (prøveudskrift)
          </label>
        </div>
      )}
      <label className="block text-xs text-muted">Antal labels pr. RMA-vare (1–4)
        <input type="number" min={1} max={4} value={vaerdi.kopier} onChange={(e) => sæt({ kopier: Math.min(4, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} className={`${felt} mt-1`} />
      </label>
      {format && (
        <div>
          <p className="text-[11px] text-muted mb-1">Sådan ser én label ud ({format.b} × {format.h} mm)</p>
          <div className="rounded-lg bg-panel p-3 overflow-hidden flex justify-center">
            <div style={{ width: `${format.b * PX_PR_MM * skala}px`, height: `${format.h * PX_PR_MM * skala}px` }}>
              <div style={{ width: `${format.b}mm`, height: `${format.h}mm`, transform: `scale(${skala})`, transformOrigin: "top left", background: "#fff", border: "1px solid #bbb" }}>
                <RmaLabel label={eksempel} niveau={labelNiveau(format)} />
              </div>
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted">Udskrift sker via browserens print-dialog, så enhver installeret printer kan vælges. Vælg samme papirstørrelse i printerens indstillinger, slå "tilpas til side" fra, og lav gerne en prøveudskrift på almindeligt papir først.</p>
    </div>
  );
}

function useLabelIndstillinger() {
  const [v, setV] = useState(() => { try { return laesLabelIndstillinger(window.localStorage); } catch (_) { return laesLabelIndstillinger({ getItem: () => null }); } });
  const sæt = (nyt) => { setV(nyt); try { gemLabelIndstillinger(window.localStorage, nyt); } catch (_) { /* kun en bekvemmelighed */ } };
  const egen = useMemo(() => tilpasFormat(v.egen), [v.egen]);
  const format = findFormat(v.formatId, egen);
  return [v, sæt, format];
}

// En enkelt RMA-vare: print dens label(s) fra sagen.
export function RmaLabelDialog({ order, linje, butik, onClose }) {
  const [v, sæt, format] = useLabelIndstillinger();
  const labels = rmaLabelsTilSager({ orders: [{ ...order, varelinjer: [linje] }], butik, varenavn: lineItemLabel, kopier: v.kopier });
  const print = () => {
    if (!format || labels.length === 0) return;
    udskriv({ css: sideCss(format), element: <LabelSider format={format} labels={labels} start={v.start} rammer={v.rammer} /> });
  };
  return (
    <Ramme titel={`RMA-label ${linje.rma?.nr || ""}`} onClose={onClose}>
      <LabelValg vaerdi={v} onChange={sæt} />
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={print} disabled={!format || labels.length === 0} className={`${knap} flex-1 text-white bg-brand hover:bg-brand-dark disabled:opacity-50`}>Udskriv {labels.length} {labels.length === 1 ? "label" : "labels"}</button>
        <button type="button" onClick={onClose} className={`${knap} border border-line text-muted hover:border-muted`}>Luk</button>
      </div>
    </Ramme>
  );
}

// Lager-siden: pakkeliste (komplet eller pr. bil) og RMA-labels til turen.
export function UdskrivDialog({ erPlukbar, orders, vehicles, technicians, personnel, crew, timeOff, primaryServices, dato, store, onClose }) {
  const [bilId, setBilId] = useState("");
  const [kunMangler, setKunMangler] = useState(false);
  const [medRma, setMedRma] = useState(true);
  const [v, sæt, format] = useLabelIndstillinger();
  const butik = store?.navn || "";

  const data = useMemo(() => {
    const bilerMedNavn = (vehicles || []).map((x) => ({ ...x, navn: technicians?.find((t) => t.id === x.id)?.navn || x.navn }));
    const points = orders.filter((o) => o.dato === dato && erPlukbar(o, vehicles)).flatMap((order) => (order.varelinjer || []).map((lineItem) => ({ order, lineItem }))).filter((p) => linjeSkalPlukkes(p.lineItem, primaryServices));
    return pakkelisteData({
      orders, points, vehicles: bilerMedNavn, dato, bilId: bilId || null, kunMangler, sammenlign: dailyOrderCompare, erManglende: isMissingActive,
      personnel, helpers: crew?.helpers, erMedhjaelper: erMedhjaelperRolle, fraværende: (id, d) => isTechnicianAbsent(id, d, timeOff),
    });
  }, [orders, vehicles, technicians, personnel, crew, timeOff, primaryServices, dato, bilId, kunMangler]);
  const alleBiler = useMemo(() => pakkelisteData({ orders, points: [], vehicles: (vehicles || []).map((x) => ({ ...x, navn: technicians?.find((t) => t.id === x.id)?.navn || x.navn })), dato, sammenlign: dailyOrderCompare }), [orders, vehicles, technicians, dato]);

  const labels = useMemo(() => rmaLabelsTilSager({ orders: sagerPaaTuren(data), butik, varenavn: lineItemLabel, kopier: v.kopier }), [data, butik, v.kopier]);
  const bilNavn = (b) => bilNavnUdenHold(b.navn);
  const printListe = () => udskriv({
    css: sideCss(null),
    element: <PakkelisteDokument ture={data} dato={formatLongDate(dato)} butik={butik} varenavn={lineItemLabel} bilNavn={bilNavn} ydelseTekst={(l) => [l.primaerYdelse?.navn, ...(l.tillaeg || []).map((y) => y.navn)].filter(Boolean).join(" · ")} medRma={medRma} />,
  });
  const printLabels = () => { if (format && labels.length) udskriv({ css: sideCss(format), element: <LabelSider format={format} labels={labels} start={v.start} rammer={v.rammer} /> }); };

  return (
    <Ramme titel="Udskriv pakkeliste og labels" onClose={onClose}>
      <p className="text-xs text-muted mb-3">{formatLongDate(dato)}. Stoppene står i læsserækkefølge (sidste stop på ruten først).</p>
      <div className="space-y-3 mb-4">
        <label className="block text-xs text-muted">Omfang
          <select value={bilId} onChange={(e) => setBilId(e.target.value)} className={`${felt} mt-1 min-h-[44px]`}>
            <option value="">Komplet: alle biler ({alleBiler.length})</option>
            {alleBiler.map((t) => <option key={t.bil.id} value={t.bil.id}>Kun {bilNavn(t.bil)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink min-h-[44px]"><input type="checkbox" checked={kunMangler} onChange={(e) => setKunMangler(e.target.checked)} className="w-5 h-5 accent-brand" /> Kun varer, der mangler at blive plukket</label>
        <label className="flex items-center gap-2 text-sm text-ink min-h-[44px]"><input type="checkbox" checked={medRma} onChange={(e) => setMedRma(e.target.checked)} className="w-5 h-5 accent-brand" /> Vis RMA-varer, der skal hentes retur</label>
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        <button type="button" onClick={printListe} disabled={data.length === 0} className={`${knap} text-white bg-brand hover:bg-brand-dark disabled:opacity-50`}>Udskriv pakkeliste ({data.length} {data.length === 1 ? "bil" : "biler"})</button>
        {data.length === 0 && <p className="text-xs text-muted self-center">Ingen biler har sager med pluk denne dag.</p>}
      </div>
      <div className="border-t border-divider pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink mb-1">RMA-labels til turen</h3>
        <p className="text-xs text-muted mb-3">{labels.length === 0 ? "Ingen åbne RMA-varer på de valgte sager." : `${labels.length} ${labels.length === 1 ? "label" : "labels"} til varer, der skal hentes retur. Montøren klistrer dem på ved afhentning.`}</p>
        <LabelValg vaerdi={v} onChange={sæt} />
        <button type="button" onClick={printLabels} disabled={!format || labels.length === 0} className={`${knap} mt-3 w-full text-white bg-brand hover:bg-brand-dark disabled:opacity-50`}>Udskriv {labels.length} {labels.length === 1 ? "label" : "labels"}</button>
      </div>
    </Ramme>
  );
}
