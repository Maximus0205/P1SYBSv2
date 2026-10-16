import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, PackageSearch, Phone, ArrowRight, Check, RotateCw } from "lucide-react";
import { lineItemLabel } from "../data/domain";
import { findPosAlternatives } from "../lib/dataStore";
import { rangerAlternativer, normaliserVare, beregnKonsekvens, kr, krMedFortegn } from "../data/erstatning";

// ERSTATNING AF MANGLENDE VARE (oktober 2026). Åbnes fra notifikationen "sager mangler varer".
//
// Henter lignende varer fra POS (Flow Retail) via adapteren og viser, hvad et skifte betyder - for
// kunden og for butikkens avance - FØR sælgeren ringer. Panelet RÅDGIVER: intet ændres på sagen, før
// sælgeren selv vælger en vare og bekræfter. Skiftet bruger den almindelige varelinje-opdatering
// (modelfeltet ændres), og så forsvinder notifikationen af sig selv - se isMissingActive i domain.js.
//
// Priser og lager kommer fra POS. Er POS ikke koblet på, eller svarer den ikke, siger panelet det ligeud
// og viser aldrig tal, det ikke har.

const FORSKEL_FARVE = (n, omvendt) => (n === null || n === 0 ? "text-muted" : (n > 0) !== !!omvendt ? "text-danger" : "text-success");

function Raekke({ label, vaerdi, forskel, omvendt }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm py-1">
      <span className="text-muted">{label}</span>
      <span className="text-right">
        <span className="font-semibold text-ink">{vaerdi}</span>
        {forskel !== undefined && forskel !== null && (
          <span className={`ml-2 text-xs font-semibold ${FORSKEL_FARVE(forskel, omvendt)}`}>{krMedFortegn(forskel)}</span>
        )}
      </span>
    </div>
  );
}

function Scenarie({ titel, hjaelp, rows }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink">{titel}</p>
      <p className="text-[11px] text-muted mb-1">{hjaelp}</p>
      {rows}
    </div>
  );
}

function Konsekvens({ original, valgt }) {
  const k = beregnKonsekvens(original, valgt);
  if (!original) {
    return <p className="text-xs text-muted">Den oprindelige vare findes ikke i POS, så der kan ikke sammenlignes. Tjek priserne ovenfor før du aftaler noget med kunden.</p>;
  }
  if (!k) return null;
  const ukendt = k.behold.avanceKr === null && k.fuld.avanceKr === null;
  return (
    <div className="space-y-2">
      {ukendt && <p className="text-xs text-muted">POS mangler indkøbs- eller udsalgspris på en af varerne, så avancen kan ikke regnes.</p>}
      <Scenarie
        titel="Kunden beholder sin pris"
        hjaelp="Butikken tager forskellen."
        rows={(
          <>
            <Raekke label="Kunden betaler" vaerdi={kr(k.behold.kundePris)} />
            <Raekke label="Avance" vaerdi={`${kr(k.behold.avanceKr)}${k.behold.avanceProcent !== null ? ` (${Math.round(k.behold.avanceProcent)} %)` : ""}`} forskel={k.behold.avanceForskelKr} omvendt />
          </>
        )}
      />
      <Scenarie
        titel="Kunden følger den nye pris"
        hjaelp="Kunden efterbetaler eller får penge tilbage."
        rows={(
          <>
            <Raekke label="Kunden betaler" vaerdi={kr(k.fuld.kundePris)} forskel={k.fuld.kundeForskel} />
            <Raekke label="Avance" vaerdi={`${kr(k.fuld.avanceKr)}${k.fuld.avanceProcent !== null ? ` (${Math.round(k.fuld.avanceProcent)} %)` : ""}`} forskel={k.fuld.avanceForskelKr} omvendt />
          </>
        )}
      />
    </div>
  );
}

function ErstatningPanel({ order, line, storeId, canChange, onApply, onOpenOrder, onClose }) {
  const [status, setStatus] = useState("henter"); // henter | klar | fejl
  const [fejl, setFejl] = useState("");
  const [original, setOriginal] = useState(null);
  const [liste, setListe] = useState([]);
  const [valgtId, setValgtId] = useState(null);
  const [bekraeft, setBekraeft] = useState(false);
  const [udfoert, setUdfoert] = useState(null);
  const lukRef = useRef(null);
  const taeller = useRef(0);
  // Opslaget gælder den vare, der MANGLEDE, da panelet åbnede. Skifter sælgeren varen, ændres linjen, men
  // der skal ikke slås op igen - derfor læses de oprindelige værdier ÉN gang.
  const soeg = useRef({ maerke: line.maerke || "", model: line.model || "", varetypeNavn: line.varetypeNavn || "" });

  const hent = useCallback(async () => {
    const nr = ++taeller.current;
    setStatus("henter"); setFejl(""); setValgtId(null); setBekraeft(false);
    const r = await findPosAlternatives({ storeId, ...soeg.current });
    if (nr !== taeller.current) return; // et nyere opslag har overtaget
    if (!r.ok) { setFejl(r.fejl || "Kunne ikke hente forslag."); setStatus("fejl"); return; }
    const o = normaliserVare(r.original);
    setOriginal(o);
    setListe(rangerAlternativer(o, r.alternativer));
    setStatus("klar");
  }, [storeId]);

  useEffect(() => { hent(); return () => { taeller.current++; }; }, [hent]);
  useEffect(() => { lukRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const idFor = (v) => v.varenummer || `${v.maerke}|${v.model}`;
  const valgt = liste.find((v) => idFor(v) === valgtId) || null;
  const telefon = (order.kunde?.telefon || "").replace(/[^\d+]/g, "");

  const skift = () => {
    if (!valgt) return;
    onApply(line.id, { maerke: valgt.maerke, model: valgt.model });
    setUdfoert(valgt);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-3" role="dialog" aria-modal="true" aria-labelledby="erstat-titel">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-xl bg-white border border-line shadow-lg p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 id="erstat-titel" className="text-sm font-semibold uppercase tracking-wide text-ink flex items-center gap-2">
            <PackageSearch size={16} aria-hidden="true" /> Erstat manglende vare
          </h2>
          <button ref={lukRef} onClick={onClose} aria-label="Luk" className="w-11 h-11 -m-2 flex items-center justify-center rounded-lg text-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-lg border border-danger/40 bg-[#FBEFEF] p-3 mb-3">
          <p className="text-sm font-semibold text-ink">{lineItemLabel(line)}</p>
          <p className="text-xs text-muted">{order.kunde?.navn} · sag #{order.nr}</p>
          {line.mangler?.note && <p className="text-xs text-danger mt-1">{line.mangler.note}</p>}
          {status === "klar" && original && (
            <p className="text-xs text-muted mt-1">
              I POS: {kr(original.udsalgspris)} udsalgspris · {kr(original.indkoebspris)} indkøb
            </p>
          )}
        </div>

        {udfoert ? (
          <div className="rounded-lg border border-success/50 bg-[#EFF6F1] p-3" role="status">
            <p className="text-sm font-semibold text-ink flex items-center gap-2"><Check size={16} className="text-success" aria-hidden="true" /> Varen er skiftet</p>
            <p className="text-xs text-muted mt-1">Sagen står nu med {[udfoert.maerke, udfoert.model].filter(Boolean).join(" ")}. Notifikationen forsvinder af sig selv. Husk at give kunden besked. Lageret skal plukke den nye vare.</p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {telefon && (
                <a href={`tel:${telefon}`} className="inline-flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-ink">
                  <Phone size={15} aria-hidden="true" /> Ring til kunden
                </a>
              )}
              <button onClick={onClose} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted">Luk</button>
            </div>
          </div>
        ) : (
          <>
            {status === "henter" && <p className="text-sm text-muted py-6 text-center" role="status">Henter lignende varer fra POS…</p>}

            {status === "fejl" && (
              <div className="rounded-lg border border-line p-3" role="alert">
                <p className="text-sm text-ink">{fejl}</p>
                <button onClick={hent} className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand">
                  <RotateCw size={13} aria-hidden="true" /> Prøv igen
                </button>
              </div>
            )}

            {status === "klar" && liste.length === 0 && (
              <p className="text-sm text-muted py-4">POS fandt ingen lignende varer. Aftal en ny dato med kunden, eller vælg en vare selv under "Redigér booking".</p>
            )}

            {status === "klar" && liste.length > 0 && (
              <>
                <p className="text-xs text-muted mb-1.5">{liste.length} {liste.length === 1 ? "mulighed" : "muligheder"} — på lager først, derefter nærmest i pris</p>
                <div className="space-y-1.5 mb-3" role="radiogroup" aria-label="Erstatningsvarer">
                  {liste.map((v) => {
                    const k = beregnKonsekvens(original, v);
                    const aktiv = idFor(v) === valgtId;
                    return (
                      <button
                        key={idFor(v)} role="radio" aria-checked={aktiv} onClick={() => { setValgtId(idFor(v)); setBekraeft(false); }}
                        className={`w-full text-left rounded-lg border px-3 py-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand transition-colors ${aktiv ? "border-brand bg-[#FBEFEF]" : "border-line hover:border-muted"}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-ink truncate">{[v.maerke, v.model].filter(Boolean).join(" ") || v.navn}</span>
                            {v.navn && (v.maerke || v.model) && <span className="block text-xs text-muted truncate">{v.navn}</span>}
                          </span>
                          <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded ${v.lager > 0 ? "bg-[#EFF6F1] text-success" : "bg-panel text-muted"}`}>
                            {v.lager === null ? "Lager ukendt" : v.lager > 0 ? `${v.lager} på lager` : "Ikke på lager"}
                          </span>
                        </span>
                        <span className="flex items-baseline justify-between gap-2 mt-1 text-xs text-muted">
                          <span>{kr(v.udsalgspris)} · indkøb {kr(v.indkoebspris)}</span>
                          {k && k.udsalgsForskel !== null && <span className={`font-semibold ${FORSKEL_FARVE(k.udsalgsForskel)}`}>{krMedFortegn(k.udsalgsForskel)} for kunden</span>}
                        </span>
                        {v.forskelle.length > 0 && <span className="block text-[11px] text-muted mt-0.5">{v.forskelle.join(" · ")}</span>}
                      </button>
                    );
                  })}
                </div>

                {valgt && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink mb-1.5">Konsekvens</p>
                    <Konsekvens original={original} valgt={valgt} />
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2 flex-wrap">
              {valgt && canChange && !bekraeft && (
                <button onClick={() => setBekraeft(true)} className="flex-1 min-w-[10rem] py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-ink transition-colors">
                  Skift til denne vare
                </button>
              )}
              {valgt && canChange && bekraeft && (
                <button onClick={skift} className="flex-1 min-w-[10rem] py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-danger hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink transition-colors">
                  Ja, skift varen på sagen
                </button>
              )}
              {valgt && !canChange && <p className="text-xs text-muted w-full">Du har ikke rettigheden til at ændre varer på sagen. Åbn sagen, eller bed en kollega skifte den.</p>}
              <button onClick={() => onOpenOrder(order.id)} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted">
                Åbn sagen <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
            {valgt && canChange && bekraeft && <p className="text-[11px] text-muted mt-2">Varen ændres på sagen, og lageret skal plukke den nye vare. Kunden får ikke automatisk besked.</p>}
          </>
        )}
      </div>
    </div>
  );
}

export { ErstatningPanel };
