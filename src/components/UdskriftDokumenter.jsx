import React from "react";
import { code128Soejler, kanKodes } from "../lib/code128";
import { lavSider, labelNiveau } from "../lib/udskrift";
import { rmaStatusLabel } from "../lib/rma";

// DOKUMENTER TIL UDSKRIFT (oktober 2026): RMA-label, ark/rulle med labels og pakkelisten. Kun visning - reglerne ligger i lib/udskrift.js, lib/rma.js og lib/pakkeliste.js.
// Alt er målsat i millimeter og pt, så det kommer ud i den rigtige størrelse uanset skærm. Ingen farver er nødvendige (sort/hvid termoprinter).

const INK = "#000";
const SKRIFT = {
  mini: { nr: 11, tekst: 6.5, bar: 8, pad: 1.2 },
  kompakt: { nr: 15, tekst: 7.5, bar: 11, pad: 1.8 },
  normal: { nr: 20, tekst: 9, bar: 16, pad: 2.5 },
  stor: { nr: 30, tekst: 12, bar: 28, pad: 4 },
};

// Stregkoden som SVG: skaleres til labelens bredde, højden angives i mm. crispEdges = skarpe streger.
export function Stregkode({ tekst, hoejdeMm }) {
  if (!kanKodes(tekst)) return null;
  const { soejler, bredde } = code128Soejler(tekst);
  return (
    <svg viewBox={`0 0 ${bredde} 1`} preserveAspectRatio="none" role="img" aria-label={`Stregkode ${tekst}`} style={{ display: "block", width: "100%", height: `${hoejdeMm}mm` }} shapeRendering="crispEdges">
      {soejler.map((s) => <rect key={s.x} x={s.x} y={0} width={s.b} height={1} fill={INK} />)}
    </svg>
  );
}

// Selve RMA-labelen. niveau afgør, hvor meget der er plads til (se labelNiveau).
export function RmaLabel({ label, niveau = "normal" }) {
  const f = SKRIFT[niveau] || SKRIFT.normal;
  const linje = { fontSize: `${f.tekst}pt`, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <div style={{ boxSizing: "border-box", width: "100%", height: "100%", padding: `${f.pad}mm`, color: INK, fontFamily: "Arial, Helvetica, sans-serif", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "2mm" }}>
          <span style={{ fontSize: `${f.nr}pt`, fontWeight: 800, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{label.nr}</span>
          {niveau === "kompakt" && label.butik && <span style={{ ...linje, fontSize: `${Math.max(6, f.tekst - 1)}pt`, textAlign: "right" }}>{label.butik}</span>}
        </div>
        <Stregkode tekst={label.nr} hoejdeMm={f.bar} />
      </div>
      <div>
        {niveau === "mini" ? (
          <div style={linje}>{[label.kunde, label.vare].filter(Boolean).join(" · ")}</div>
        ) : (
          <>
            <div style={{ ...linje, fontWeight: 700 }}>{[label.kunde, label.sag].filter(Boolean).join(" · ")}</div>
            {label.vare && <div style={linje}>{label.vare}</div>}
            {label.serienr && <div style={linje}>Serienr.: {label.serienr}</div>}
            {label.aarsag && niveau !== "kompakt" && <div style={{ ...linje, whiteSpace: niveau === "stor" ? "normal" : "nowrap" }}>Årsag: {label.aarsag}</div>}
            {(niveau === "normal" || niveau === "stor") && label.butik && <div style={{ ...linje, fontWeight: 700 }}>{label.butik}{label.dato ? ` · ${label.dato}` : ""}</div>}
          </>
        )}
      </div>
    </div>
  );
}

// Sider med labels på ark eller rulle. rammer = tegn en tynd ramme om hver label (til prøveudskrift på almindeligt papir).
export function LabelSider({ format, labels, start = 1, rammer = false }) {
  const niveau = labelNiveau(format);
  const sider = lavSider(format, labels, start);
  const sideB = format.type === "rulle" ? format.b : 210, sideH = format.type === "rulle" ? format.h : 297;
  return (
    <>
      {sider.map((side, si) => (
        <section key={si} className="print-side" style={{ position: "relative", width: `${sideB}mm`, height: `${sideH}mm`, overflow: "hidden", pageBreakAfter: si < sider.length - 1 ? "always" : "auto", breakAfter: si < sider.length - 1 ? "page" : "auto" }}>
          {side.celler.filter((c) => c.label).map((c) => (
            <div key={c.plads} style={{ position: "absolute", left: `${c.x}mm`, top: `${c.y}mm`, width: `${format.b}mm`, height: `${format.h}mm`, outline: rammer ? "0.2mm dashed #888" : "none", outlineOffset: "-0.2mm" }}>
              <RmaLabel label={c.label} niveau={niveau} />
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

const Boks = ({ tom }) => (
  <span aria-hidden="true" style={{ display: "inline-block", width: "4.2mm", height: "4.2mm", border: "0.4mm solid #000", marginRight: "2mm", verticalAlign: "-0.8mm", textAlign: "center", lineHeight: "3.4mm", fontSize: "3.6mm", fontWeight: 700 }}>{tom ? "" : "✓"}</span>
);

// Pakkelisten: én side (eller flere) pr. bil. Stoppene står i læsserækkefølge: nr. 1 læsses først og står længst inde.
// props: ture = lib/pakkeliste.js: pakkelisteData; dato = tekst ("tirsdag den 27. oktober"); butik = butikkens navn; varenavn(linje); bilNavn(bil); ydelseTekst(linje).
export function PakkelisteDokument({ ture, dato, butik, varenavn, bilNavn, ydelseTekst, medRma = true }) {
  const th = { textAlign: "left", fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.04em", padding: "1mm 2mm", borderBottom: "0.3mm solid #000" };
  return (
    <div style={{ color: INK, fontFamily: "Arial, Helvetica, sans-serif", fontSize: "10pt", lineHeight: 1.3 }}>
      {ture.map((t, ti) => (
        <section key={t.bil.id} style={{ pageBreakAfter: ti < ture.length - 1 ? "always" : "auto", breakAfter: ti < ture.length - 1 ? "page" : "auto" }}>
          <header style={{ borderBottom: "0.8mm solid #000", paddingBottom: "2mm", marginBottom: "3mm" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h1 style={{ fontSize: "20pt", margin: 0, fontWeight: 800 }}>Pakkeliste · {bilNavn(t.bil)}</h1>
              <span style={{ fontSize: "10pt" }}>{butik}</span>
            </div>
            <div style={{ fontSize: "11pt", marginTop: "1mm" }}>{dato}</div>
            <div style={{ fontSize: "10pt", marginTop: "1mm" }}>
              <strong>Montør:</strong> {t.hold.montoerer.length ? t.hold.montoerer.join(", ") : "ingen i dag"} &nbsp;·&nbsp; <strong>2. mand:</strong> {t.hold.andenMand.length ? t.hold.andenMand.join(", ") : "ingen"}
              {t.hold.fravaer > 0 ? ` · ${t.hold.fravaer} fraværende` : ""}
            </div>
            <div style={{ fontSize: "9pt", marginTop: "1mm" }}>
              {t.antalStop} stop · {t.antalLinjer} varer ({t.antalPlukket} plukket){t.antalRma > 0 ? ` · ${t.antalRma} RMA-varer hentes retur` : ""}
            </div>
            <div style={{ fontSize: "9pt", marginTop: "1mm", fontStyle: "italic" }}>Læs i rækkefølgen herunder: nr. 1 læsses først og står længst inde. Bilen kører stoppene i omvendt rækkefølge.</div>
          </header>

          {t.stops.map((s) => (
            <div key={s.order.id} style={{ breakInside: "avoid", pageBreakInside: "avoid", border: "0.4mm solid #000", marginBottom: "3mm" }}>
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <div style={{ width: "17mm", background: "#000", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1mm 0" }}>
                  <span style={{ fontSize: "7pt", textTransform: "uppercase", letterSpacing: "0.05em" }}>Læs</span>
                  <span style={{ fontSize: "20pt", fontWeight: 800, lineHeight: 1 }}>{s.laesNr}</span>
                </div>
                <div style={{ flex: 1, padding: "1.5mm 3mm" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm" }}>
                    <strong style={{ fontSize: "11pt" }}>{s.order.kunde?.navn || "Ukendt kunde"}</strong>
                    <span style={{ fontSize: "9pt", whiteSpace: "nowrap" }}>Sag #{s.order.nr} · kører som stop {s.koerselNr} af {t.antalStop}{s.order.start ? ` · ${s.order.start}` : ""}</span>
                  </div>
                  {s.order.kunde?.adresse && <div style={{ fontSize: "9pt" }}>{s.order.kunde.adresse}{s.order.kunde?.telefon ? ` · ${s.order.kunde.telefon}` : ""}</div>}
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {s.linjer.length === 0 && <tr><td style={{ padding: "1.5mm 3mm", fontSize: "9pt", fontStyle: "italic" }}>Intet at plukke til dette stop.</td></tr>}
                  {s.linjer.map((l) => (
                    <tr key={l.id} style={{ borderTop: "0.2mm solid #999" }}>
                      <td style={{ padding: "1.5mm 3mm" }}><Boks tom={!l.plukket} />{varenavn(l)}{l.mangler?.note ? <strong style={{ marginLeft: "2mm" }}> · MANGLER</strong> : null}</td>
                      <td style={{ padding: "1.5mm 3mm", fontSize: "8.5pt", textAlign: "right" }}>{ydelseTekst(l)}</td>
                    </tr>
                  ))}
                  {medRma && s.rma.map((l) => (
                    <tr key={l.id} style={{ borderTop: "0.2mm solid #999", background: "#eee" }}>
                      <td style={{ padding: "1.5mm 3mm" }}><Boks tom />
                        <strong>HENT RETUR (RMA)</strong> · {varenavn(l)}{l.rma.serienr ? ` · serienr. ${l.rma.serienr}` : ""}
                      </td>
                      <td style={{ padding: "1.5mm 3mm", fontSize: "8.5pt", textAlign: "right", whiteSpace: "nowrap" }}>{l.rma.nr} · {rmaStatusLabel(l.rma.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <footer style={{ marginTop: "6mm", display: "flex", gap: "8mm", fontSize: "9pt" }}>
            {["Plukket af", "Læsset af", "Dato / tid"].map((x) => (
              <div key={x} style={{ flex: 1 }}><div style={{ borderBottom: "0.3mm solid #000", height: "8mm" }} /><div style={{ marginTop: "0.8mm" }}>{x}</div></div>
            ))}
          </footer>
        </section>
      ))}
      {ture.length === 0 && <p style={{ fontSize: "11pt" }}>Ingen biler har sager med pluk denne dag.</p>}
    </div>
  );
}

// Plukkeseddel for ÉN sag (oktober 2026): én A4-side pr. sag, til at lægge/tape på de varer, der er sat til side. Stort banner øverst, så ingen udleverer varerne ved en fejl.
// props: sager = [{ order, linjer, rma, bilNavn, hold }]; datoTekst(order) -> tekst; notat = fri tekst fra lageret; butik; varenavn(linje); ydelseTekst(linje).
export function PlukseddelDokument({ sager, butik, notat = "", datoTekst, varenavn, ydelseTekst, medRma = true }) {
  const felt = { fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.05em" };
  return (
    <div style={{ color: INK, fontFamily: "Arial, Helvetica, sans-serif", fontSize: "11pt", lineHeight: 1.3 }}>
      {sager.map((s, i) => {
        const o = s.order;
        const montoer = s.hold?.montoerer?.length ? s.hold.montoerer.join(", ") : "";
        const anden = s.hold?.andenMand?.length ? s.hold.andenMand.join(", ") : "";
        return (
          <section key={o.id} style={{ pageBreakAfter: i < sager.length - 1 ? "always" : "auto", breakAfter: i < sager.length - 1 ? "page" : "auto" }}>
            <div style={{ background: "#000", color: "#fff", padding: "4mm 5mm", marginBottom: "4mm" }}>
              <div style={{ ...felt, fontSize: "9pt" }}>Sat til side · må ikke udleveres</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6mm" }}>
                <span style={{ fontSize: "30pt", fontWeight: 800, lineHeight: 1.1 }}>Sag #{o.nr}</span>
                <span style={{ fontSize: "16pt", fontWeight: 700, textAlign: "right" }}>{datoTekst(o)}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "6mm", alignItems: "flex-start", marginBottom: "4mm" }}>
              <div style={{ flex: 1 }}>
                <div style={felt}>Kunde</div>
                <div style={{ fontSize: "15pt", fontWeight: 800 }}>{o.kunde?.navn || "Ukendt kunde"}</div>
                {o.kunde?.adresse && <div>{o.kunde.adresse}</div>}
                {o.kunde?.telefon && <div>Tlf. {o.kunde.telefon}</div>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={felt}>Levering</div>
                <div><strong>{s.bilNavn || "Bil ikke valgt endnu"}</strong>{o.start ? ` · kl. ${o.start}` : ""}</div>
                {montoer && <div>Montør: {montoer}</div>}
                {anden && <div>2. mand: {anden}</div>}
                {o.sagstype && <div style={{ fontSize: "9pt" }}>Sagstype: {o.sagstype}</div>}
              </div>
              {kanKodes(`SAG-${o.nr}`) && (
                <div style={{ width: "48mm" }}>
                  <Stregkode tekst={`SAG-${o.nr}`} hoejdeMm={14} />
                  <div style={{ fontSize: "8pt", textAlign: "center" }}>SAG-{o.nr}</div>
                </div>
              )}
            </div>

            {notat.trim() && (
              <div style={{ border: "0.6mm solid #000", padding: "2.5mm 3mm", marginBottom: "4mm" }}>
                <div style={felt}>Notat fra lageret</div>
                <div style={{ fontSize: "12pt", fontWeight: 700, whiteSpace: "pre-wrap" }}>{notat.trim()}</div>
              </div>
            )}

            <div style={{ ...felt, marginBottom: "1mm" }}>Varer der skal plukkes ({s.linjer.length})</div>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "0.4mm solid #000" }}>
              <tbody>
                {s.linjer.length === 0 && <tr><td style={{ padding: "3mm", fontStyle: "italic" }}>Ingen varer, der skal plukkes, på denne sag.</td></tr>}
                {s.linjer.map((l) => (
                  <tr key={l.id} style={{ borderTop: "0.2mm solid #999" }}>
                    <td style={{ padding: "2.5mm 3mm", fontSize: "12pt" }}><Boks tom={!l.plukket} /><strong>{varenavn(l)}</strong>{(l.opgavebeskrivelse || "").trim() ? <div style={{ fontSize: "9pt", marginLeft: "6.2mm" }}>{l.opgavebeskrivelse}</div> : null}</td>
                    <td style={{ padding: "2.5mm 3mm", fontSize: "9pt", textAlign: "right" }}>{ydelseTekst(l)}</td>
                  </tr>
                ))}
                {medRma && s.rma.map((l) => (
                  <tr key={l.id} style={{ borderTop: "0.2mm solid #999", background: "#eee" }}>
                    <td style={{ padding: "2.5mm 3mm" }}><Boks tom /><strong>HENT RETUR (RMA)</strong> · {varenavn(l)}</td>
                    <td style={{ padding: "2.5mm 3mm", fontSize: "9pt", textAlign: "right", whiteSpace: "nowrap" }}>{l.rma.nr}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <footer style={{ marginTop: "8mm", display: "flex", gap: "8mm", fontSize: "9pt" }}>
              {["Plukket af", "Placering (hylde/palle)", "Dato / tid"].map((x) => (
                <div key={x} style={{ flex: 1 }}><div style={{ borderBottom: "0.3mm solid #000", height: "9mm" }} /><div style={{ marginTop: "0.8mm" }}>{x}</div></div>
              ))}
            </footer>
            <div style={{ marginTop: "5mm", fontSize: "8pt", color: "#333" }}>{butik}</div>
          </section>
        );
      })}
    </div>
  );
}

// Ugeoversigten (A4 på langs): bilerne som rækker, dagene som kolonner. Kun visning - samlingen sker i lib/ugeoversigt.js.
export function UgeoversigtDokument({ uge, butik, titel, dagLabel }) {
  const celle = { border: "0.25mm solid #000", padding: "1.2mm 1.5mm", verticalAlign: "top", fontSize: "8pt", lineHeight: 1.25, wordBreak: "break-word" };
  return (
    <div style={{ color: INK, fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "3mm" }}>
        <span style={{ fontSize: "16pt", fontWeight: 800 }}>{titel}</span>
        <span style={{ fontSize: "9pt" }}>{butik}{butik ? " · " : ""}{uge.antal} {uge.antal === 1 ? "sag" : "sager"}</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ ...celle, width: "24mm", textAlign: "left", background: "#e5e5e5" }}>Bil</th>
            {uge.dage.map((d) => <th key={d} style={{ ...celle, textAlign: "left", fontSize: "9pt", background: "#e5e5e5" }}>{dagLabel(d)}</th>)}
          </tr>
        </thead>
        <tbody>
          {uge.raekker.map((r) => (
            <tr key={r.id ?? "ingen"} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
              <th style={{ ...celle, textAlign: "left", fontSize: "9pt" }}>
                {r.navn}{r.lukket ? " (lukket)" : ""}
              </th>
              {r.celler.map((c, i) => (
                <td key={c.dato} style={celle}>
                  {r.hold[i] && <div style={{ fontSize: "7pt", fontStyle: "italic", marginBottom: "0.8mm" }}>{r.hold[i]}</div>}
                  {c.sager.length === 0 ? <span style={{ color: "#777" }}>—</span> : c.sager.map((s) => (
                    <div key={s.id} style={{ marginBottom: "1.2mm", textDecoration: s.afsluttet ? "line-through" : "none" }}>
                      <strong>{s.tid}</strong> {s.kunde} <span style={{ fontSize: "7pt" }}>#{s.nr}{s.toMand ? " · 2 mand" : ""}</span>
                      {s.adresse && <div style={{ fontSize: "7pt" }}>{s.adresse}</div>}
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {uge.raekker.length === 0 && <p style={{ marginTop: "6mm", fontSize: "10pt" }}>Ingen sager eller biler i perioden.</p>}
      <p style={{ marginTop: "3mm", fontSize: "7pt" }}>Overstregede sager er afsluttet. Udskrevet {new Date().toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" })}.</p>
    </div>
  );
}
