import React, { useEffect, useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { lineItemLabel, formatLongDate } from "../data/domain";
import { getAttachmentsResult, getAttachmentUrls } from "../lib/attachments";
import { rapportData, rapportMangler, kanLaveRapport, MAX_RAPPORT_TEKST } from "../lib/afleveringsrapport";
import { sideCss } from "../lib/udskrift";
import { udskriv } from "./Udskriv";
import { Ramme } from "./UdskrivDialoger";

// AFLEVERINGSRAPPORT (oktober 2026): dokumentet til kunden (PDF via "Gem som PDF" i printdialogen, eller på papir) og dialogen, der samler det. Reglerne ligger i lib/afleveringsrapport.js.
// Sagens interne noter er aldrig med. Billederne vælges til/fra, så intet utilsigtet følger med til kunden.

const INK = "#000";
const felt = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
const knap = "min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand transition-colors";
const label = { fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.06em", color: "#444", marginBottom: "1mm" };
const sektion = { marginBottom: "6mm", breakInside: "avoid", pageBreakInside: "avoid" };

const datoTid = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("da-DK", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function RapportDokument({ data, butik, billeder }) {
  const Tekst = ({ children }) => <div style={{ whiteSpace: "pre-wrap", fontSize: "11pt", lineHeight: 1.4 }}>{children}</div>;
  return (
    <div style={{ color: INK, fontFamily: "Arial, Helvetica, sans-serif", fontSize: "11pt", lineHeight: 1.35 }}>
      <div style={{ borderBottom: "0.6mm solid #000", paddingBottom: "3mm", marginBottom: "6mm", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "6mm" }}>
        <div>
          <div style={{ fontSize: "22pt", fontWeight: 800 }}>Afleveringsrapport</div>
          <div style={{ fontSize: "11pt" }}>Sag #{data.nr}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "10pt" }}>
          {butik && <div style={{ fontWeight: 700, fontSize: "12pt" }}>{butik}</div>}
          {data.afsluttet && <div>Afsluttet {datoTid(data.afsluttet)}</div>}
        </div>
      </div>

      <div style={{ ...sektion, display: "flex", gap: "8mm" }}>
        <div style={{ flex: 1 }}>
          <div style={label}>Kunde</div>
          <div style={{ fontWeight: 700 }}>{data.kunde || "—"}</div>
          {data.adresse && <div>{data.adresse}</div>}
          {data.telefon && <div>Tlf. {data.telefon}</div>}
        </div>
        {data.dato && (
          <div style={{ flex: 1 }}>
            <div style={label}>Leveringsdato</div>
            <div>{formatLongDate(data.dato)}</div>
          </div>
        )}
      </div>

      {data.varer.length > 0 && (
        <div style={sektion}>
          <div style={label}>Varer og ydelser</div>
          {data.varer.map((v) => (
            <div key={v.id} style={{ padding: "1mm 0", borderBottom: "0.2mm solid #ccc" }}>
              <strong>{v.navn}</strong>{v.ydelser ? <span style={{ color: "#333" }}> — {v.ydelser}</span> : null}
            </div>
          ))}
        </div>
      )}

      {data.udfoert && <div style={sektion}><div style={label}>Udført arbejde</div><Tekst>{data.udfoert}</Tekst></div>}

      {data.materialer.length > 0 && (
        <div style={sektion}>
          <div style={label}>Brugte materialer</div>
          {data.materialer.map((m, i) => <div key={i}>{m.antal > 1 ? `${m.antal}× ` : ""}{m.navn}</div>)}
        </div>
      )}

      {data.noter && <div style={sektion}><div style={label}>Noter</div><Tekst>{data.noter}</Tekst></div>}

      {data.tidligere.length > 0 && (
        <div style={sektion}>
          {data.tidligere.map((r, i) => (
            <div key={i} style={{ marginBottom: "3mm" }}><div style={label}>{r.titel}</div><Tekst>{r.tekst}</Tekst></div>
          ))}
        </div>
      )}

      {billeder.length > 0 && (
        <div style={{ marginBottom: "6mm" }}>
          <div style={label}>Dokumentation</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm" }}>
            {billeder.map((b) => (
              <div key={b.id} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                <img src={b.src} alt={b.navn} style={{ width: "100%", maxHeight: "85mm", objectFit: "contain", border: "0.2mm solid #999", display: "block" }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.underskrift && (
        <div style={{ ...sektion, marginTop: "8mm" }}>
          <div style={label}>Kvittering</div>
          <img src={data.underskrift.data} alt={`Underskrift fra ${data.underskrift.navn}`} style={{ height: "22mm", maxWidth: "80mm", objectFit: "contain", display: "block", borderBottom: "0.3mm solid #000" }} />
          <div style={{ fontSize: "10pt" }}>{data.underskrift.navn}{data.underskrift.tid ? ` · ${data.underskrift.tid}` : ""}</div>
        </div>
      )}
    </div>
  );
}

// Vent til billederne er hentet, før printdialogen åbner - ellers kommer de ud som tomme felter.
function forudindlaes(kilder) {
  return Promise.all(kilder.map((src) => new Promise((res) => {
    const i = new Image();
    i.onload = i.onerror = () => res();
    i.src = src;
  })));
}

export function RapportDialog({ order, butik, onClose }) {
  const [alle, setAlle] = useState(null);       // null = henter
  const [valgte, setValgte] = useState(null);
  const [fejl, setFejl] = useState("");
  const [arbejder, setArbejder] = useState(false);

  useEffect(() => {
    let ophoert = false;
    (async () => {
      const gamle = (order.billeder || []).map((b) => ({ id: `l:${b.id}`, src: b.src, navn: b.navn || "Billede" }));
      let nye = [];
      let kunne = true;
      try {
        const r = await getAttachmentsResult(order.id);
        if (r.ok) {
          const rows = r.rows.filter((a) => a.kind === "billede");
          const svar = rows.length ? await getAttachmentUrls(rows.map((a) => a.id)) : { ok: true, urls: {} };
          if (svar.ok) nye = rows.filter((a) => svar.urls?.[a.id]?.url).map((a) => ({ id: `a:${a.id}`, src: svar.urls[a.id].url, navn: a.navn || "Billede" }));
          else kunne = false;
        } else kunne = false;
      } catch (_) { kunne = false; }
      if (ophoert) return;
      const liste = [...nye, ...gamle];
      setAlle(liste);
      setValgte(new Set(liste.map((b) => b.id)));
      if (!kunne) setFejl("Billederne kunne ikke hentes lige nu. Rapporten kan stadig laves uden dem, eller du kan prøve igen senere.");
    })();
    return () => { ophoert = true; };
  }, [order.id, order.billeder]);

  const data = useMemo(() => rapportData(order, {
    varenavn: lineItemLabel,
    ydelseTekst: (l) => [l.primaerYdelse?.navn, ...(l.tillaeg || []).map((y) => y.navn)].filter(Boolean).join(" · "),
  }), [order]);
  const med = (alle || []).filter((b) => valgte?.has(b.id));
  const skift = (id) => setValgte((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const lav = async () => {
    setArbejder(true);
    await forudindlaes(med.map((b) => b.src));
    udskriv({ css: sideCss(null), element: <RapportDokument data={data} butik={butik} billeder={med} /> });
    setArbejder(false);
  };

  return (
    <Ramme titel={`Afleveringsrapport · sag #${order.nr}`} onClose={onClose}>
      {rapportMangler(order) && <p role="status" className="text-xs text-danger mb-3">Der er ikke skrevet noget under "Udført arbejde" endnu. Du kan stadig lave rapporten, men den bliver tyndere.</p>}
      <p className="text-xs text-muted mb-3">Rapporten indeholder kunde, varer, det udførte arbejde, materialer, noter til rapporten og de billeder, du vælger herunder. Interne noter kommer ikke med.</p>
      {alle === null ? (
        <p className="text-sm text-muted italic flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter billeder...</p>
      ) : (
        <>
          {fejl && <p role="alert" className="text-xs text-danger mb-3">{fejl}</p>}
          {alle.length > 0 && (
            <fieldset className="mb-3">
              <legend className="text-xs font-semibold text-ink mb-2">Billeder i rapporten ({med.length} af {alle.length})</legend>
              <div className="grid grid-cols-3 gap-2">
                {alle.map((b) => {
                  const on = valgte.has(b.id);
                  return (
                    <label key={b.id} className={`relative block rounded-lg overflow-hidden border cursor-pointer min-h-[44px] ${on ? "border-brand ring-2 ring-brand/30" : "border-line opacity-60"}`}>
                      <img src={b.src} alt={b.navn} className="w-full h-20 object-cover" />
                      <input type="checkbox" checked={on} onChange={() => skift(b.id)} aria-label={`Medtag ${b.navn}`} className="absolute top-1.5 left-1.5 w-5 h-5 accent-brand" />
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          <button type="button" onClick={lav} disabled={arbejder} className={`${knap} w-full text-white bg-brand hover:bg-brand-dark disabled:opacity-60`}>
            {arbejder ? "Forbereder..." : "Åbn rapport til udskrift / PDF"}
          </button>
          <p className="text-[11px] text-muted mt-2">I printdialogen vælger du en printer eller "Gem som PDF" (på iPhone/iPad: del-knappen og "Gem i Filer").</p>
        </>
      )}
    </Ramme>
  );
}

// Fanen Rapporter: kundevendt rapport med to felter. Rapportknappen er først åben, når sagen er afsluttet.
export function RapportFane({ order, onSave, butik, tidligere }) {
  const r = order.afleveringsrapport || {};
  const [udfoert, setUdfoert] = useState(r.udfoert || "");
  const [noter, setNoter] = useState(r.noter || "");
  const [gemt, setGemt] = useState(false);
  const [dialog, setDialog] = useState(false);
  // Hvis en anden har gemt en ny udgave, mens fanen er åben og uændret, følger felterne med.
  const [sidst, setSidst] = useState({ u: r.udfoert || "", n: r.noter || "" });
  useEffect(() => {
    const nu = { u: r.udfoert || "", n: r.noter || "" };
    if (nu.u === sidst.u && nu.n === sidst.n) return;
    if (udfoert === sidst.u && noter === sidst.n) { setUdfoert(nu.u); setNoter(nu.n); }
    setSidst(nu);
  }, [r.udfoert, r.noter]); // eslint-disable-line react-hooks/exhaustive-deps
  const aendret = udfoert.trim() !== (r.udfoert || "").trim() || noter.trim() !== (r.noter || "").trim();
  const afsluttet = kanLaveRapport(order);

  return (
    <div>
      {onSave ? (
        <div className="rounded-xl border border-line bg-white p-4 mb-4 shadow-sm space-y-3">
          <p className="text-xs text-muted">Det, du skriver her, kommer med i afleveringsrapporten til kunden. Sagens interne noter gør ikke.</p>
          <label className="block text-xs font-semibold text-ink">Udført arbejde
            <textarea value={udfoert} onChange={(e) => { setUdfoert(e.target.value); setGemt(false); }} maxLength={MAX_RAPPORT_TEKST} rows={5} placeholder="Fx Vaskemaskine monteret og tilsluttet, transportsikring fjernet, prøvekørsel udført." className={`${felt} mt-1 font-normal`} />
          </label>
          <label className="block text-xs font-semibold text-ink">Noter til rapporten (valgfrit)
            <textarea value={noter} onChange={(e) => { setNoter(e.target.value); setGemt(false); }} maxLength={MAX_RAPPORT_TEKST} rows={3} placeholder="Fx Kunden er vist brugen. Filter skal renses efter 1 måned." className={`${felt} mt-1 font-normal`} />
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" disabled={!aendret} onClick={() => { onSave({ udfoert, noter }); setGemt(true); }} className={`${knap} text-white bg-brand hover:bg-brand-dark disabled:opacity-50`}>Gem rapport</button>
            {gemt && !aendret && <span role="status" className="text-xs text-success">Gemt</span>}
            {aendret && <span className="text-xs text-muted">Ændringer er ikke gemt endnu</span>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted italic mb-4">Du kan se, men ikke skrive, rapporten på denne sag.</p>
      )}

      <button type="button" disabled={!afsluttet || aendret} onClick={() => setDialog(true)} className={`${knap} mb-1 w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-brand text-brand hover:bg-brand/5 disabled:opacity-50`}>
        <FileText size={15} aria-hidden="true" /> Lav afleveringsrapport (PDF)
      </button>
      <p className="text-xs text-muted mb-4" role="status">
        {!afsluttet ? "Rapporten kan laves, når sagen er afsluttet." : aendret ? "Gem rapporten først." : "Samler sagens oplysninger, billeder og det, du har skrevet."}
      </p>

      {tidligere}
      {dialog && <RapportDialog order={order} butik={butik} onClose={() => setDialog(false)} />}
    </div>
  );
}
