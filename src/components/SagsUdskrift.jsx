import React from "react";
import { Printer } from "lucide-react";
import { lineItemLabel, formatLongDate, timeSlotById } from "../data/domain";
import { sideCss } from "../lib/udskrift";
import { kanKodes } from "../lib/code128";
import { rmaStatusLabel } from "../lib/rma";
import { udskriv } from "./Udskriv";
import { Stregkode } from "./UdskriftDokumenter";

// UDSKRIV SAG (oktober 2026): sagen på papir (A4) til den, der har brug for den i hånden. Alle, der kan se sagen, kan udskrive den.
// Indeholder sagens oplysninger, varer og ydelser, RMA-varer og de INTERNE noter - den er til brug i butikken, ikke til kunden (kunden får afleveringsrapporten).
const INK = "#000";
const mærke = { fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.05em", color: "#444" };

const tidTekst = (o) => {
  const t = timeSlotById(o.tidsrumId);
  return o.start && o.start !== t.start ? `kl. ${o.start}${o.slut ? `–${o.slut}` : ""}` : t.label;
};

export function SagDokument({ order, bilNavn, butik }) {
  const ydelser = (l) => [l.primaerYdelse?.navn, ...(l.tillaeg || []).map((y) => y.navn)].filter(Boolean).join(" · ");
  const varer = (order.varelinjer || []).filter((l) => l && !l.rma);
  const rma = (order.varelinjer || []).filter((l) => l && l.rma);
  const noter = (order.noter || []).filter((n) => n && n.tekst);
  const sektion = { marginBottom: "5mm", breakInside: "avoid", pageBreakInside: "avoid" };
  return (
    <div style={{ color: INK, fontFamily: "Arial, Helvetica, sans-serif", fontSize: "11pt", lineHeight: 1.35 }}>
      <div style={{ borderBottom: "0.6mm solid #000", paddingBottom: "3mm", marginBottom: "5mm", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "6mm" }}>
        <div>
          <div style={{ fontSize: "24pt", fontWeight: 800 }}>Sag #{order.nr}</div>
          <div style={{ fontSize: "10pt" }}>{order.sagstype || ""}{order.status === "afsluttet" ? " · afsluttet" : ""}</div>
        </div>
        {kanKodes(`SAG-${order.nr}`) && (
          <div style={{ width: "48mm" }}>
            <Stregkode tekst={`SAG-${order.nr}`} hoejdeMm={12} />
            <div style={{ fontSize: "8pt", textAlign: "center" }}>SAG-{order.nr}</div>
          </div>
        )}
      </div>

      <div style={{ ...sektion, display: "flex", gap: "8mm" }}>
        <div style={{ flex: 1 }}>
          <div style={mærke}>Kunde</div>
          <div style={{ fontSize: "14pt", fontWeight: 800 }}>{order.kunde?.navn || "Ukendt kunde"}</div>
          {order.kunde?.adresse && <div>{order.kunde.adresse}</div>}
          {order.kunde?.telefon && <div>Tlf. {order.kunde.telefon}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={mærke}>Levering</div>
          <div style={{ fontWeight: 700 }}>{order.dato ? formatLongDate(order.dato) : "Ikke planlagt endnu"}</div>
          {order.dato && <div>{tidTekst(order)}</div>}
          <div>{bilNavn || "Bil ikke valgt"}</div>
          {order.toMand && <div style={{ fontWeight: 700 }}>Kræver to mand</div>}
          {order.ordrenummer && <div style={{ fontSize: "9pt" }}>Ordrenr. {order.ordrenummer}</div>}
        </div>
      </div>

      {(order.specialBeskrivelse || order.specialKrav) && (
        <div style={sektion}>
          <div style={mærke}>Specialopgave</div>
          {order.specialBeskrivelse && <div style={{ whiteSpace: "pre-wrap" }}>{order.specialBeskrivelse}</div>}
          {order.specialKrav && <div style={{ whiteSpace: "pre-wrap" }}>Krav til montør: {order.specialKrav}</div>}
        </div>
      )}

      <div style={sektion}>
        <div style={mærke}>Varer og ydelser</div>
        {varer.length === 0 ? <div>—</div> : varer.map((l) => (
          <div key={l.id} style={{ padding: "1.2mm 0", borderBottom: "0.2mm solid #ccc" }}>
            <strong>{lineItemLabel(l)}</strong>{l.udfoert ? " (udført)" : ""}
            {ydelser(l) && <div style={{ fontSize: "9pt" }}>{ydelser(l)}</div>}
          </div>
        ))}
      </div>

      {rma.length > 0 && (
        <div style={sektion}>
          <div style={mærke}>RMA-varer</div>
          {rma.map((l) => <div key={l.id}>{lineItemLabel(l)} · RMA-{l.rma.nr} · {rmaStatusLabel(l.rma.status)}{l.rma.aarsag ? ` · ${l.rma.aarsag}` : ""}</div>)}
        </div>
      )}

      {noter.length > 0 && (
        <div style={sektion}>
          <div style={mærke}>Noter (interne)</div>
          {noter.map((n) => <div key={n.id} style={{ whiteSpace: "pre-wrap", padding: "1mm 0" }}>{n.tekst}{n.forfatter?.navn ? ` — ${n.forfatter.navn}` : ""}</div>)}
        </div>
      )}

      <p style={{ marginTop: "6mm", fontSize: "7.5pt" }}>{butik ? `${butik} · ` : ""}Udskrevet {new Date().toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" })}. Kun til internt brug.</p>
    </div>
  );
}

export function UdskrivSagKnap({ order, bilNavn, butik, className = "" }) {
  const klik = () => udskriv({ css: sideCss(null), element: <SagDokument order={order} bilNavn={bilNavn} butik={butik} /> });
  return (
    <button type="button" onClick={klik} className={className || "text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1.5 flex items-center gap-1"}>
      <Printer size={13} aria-hidden="true" /> Udskriv sag
    </button>
  );
}
