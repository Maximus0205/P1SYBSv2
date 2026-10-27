import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Check, X } from "lucide-react";
import { guidesForBruger, laesSet, markerSet, skalStarteAutomatisk, naesteIndex, forrigeIndex, erSidsteTrin, placerKort, grupperGuides, guideForSide, tilbudForSide } from "../lib/rundvisningCore";

// RUNDVISNING (oktober 2026) - guidede rundture for sælger, admin og lager. Reglerne (hvem ser hvad, hvad er set, hvor ligger kortet)
// står i lib/rundvisningCore.js. Her er selve visningen:
//   * et fremhævet element (data-rundvisning="...") med resten af skærmen dæmpet, og et kort med forklaringen,
//   * Næste / Tilbage / Spring over, Escape lukker, og fokus flyttes til kortet (skærmlæser: dialog med overskrift og tekst),
//   * på mobil ligger kortet nederst, og elementet rulles op over det,
//   * peger et trin på en knap, brugeren selv skal trykke på (fortsaetNaar), er siden IKKE blokeret, og rundturen fortsætter, når
//     det næste element dukker op.
// Hvad der er set, gemmes pr. bruger i browseren (ingen databaseændring): kom-i-gang vises af sig selv første gang, og alle
// rundture kan startes igen fra Hjælp-knappen i topmenuen.

const RundvisningContext = createContext(null);
export const useRundvisning = () => useContext(RundvisningContext);

const finder = (maal) => (maal ? document.querySelector(`[data-rundvisning="${maal}"]`) : null);
const PAD = 6;

export function RundvisningProvider({ brugerId, rolle, erSystemadmin, tilladteSider, kanOpretteSager, aktuelSide, onNavigate, children }) {
  const guides = useMemo(
    () => guidesForBruger({ rolle, erSystemadmin, tilladteSider, kanOpretteSager }),
    // tilladteSider er en liste, der opbygges på ny ved hver visning - sammenlign på indholdet
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rolle, erSystemadmin, (tilladteSider || []).join("|"), kanOpretteSager],
  );
  const [aktiv, setAktiv] = useState(null);   // { guideId, index }
  const aktivRef = useRef(null);
  aktivRef.current = aktiv;
  // Hvad brugeren har set (pr. bruger i browseren). Holdes i state, så Hjælp-menuen og tilbuddet opdateres med det samme.
  const [set, setSet] = useState(() => { try { return laesSet(window.localStorage, brugerId); } catch (_) { return {}; } });
  useEffect(() => { try { setSet(laesSet(window.localStorage, brugerId)); } catch (_) { setSet({}); } }, [brugerId]);
  const [afvist, setAfvist] = useState({});    // tilbud afvist i denne session, hvis browseren ikke kan huske det

  const start = useCallback((guideId) => {
    const g = guides.find((x) => x.id === guideId);
    if (!g) return;
    try { markerSet(window.localStorage, brugerId, g.id); } catch (_) { /* ikke kritisk */ }
    setSet((s) => ({ ...s, [g.id]: Date.now() }));
    if (g.side && g.side !== aktuelSide) onNavigate?.(g.side);
    setAktiv({ guideId: g.id, index: 0 });
  }, [guides, brugerId, aktuelSide, onNavigate]);

  // Første login: den automatiske guide starter af sig selv, én gang. Ikke mens en sag er åben, og ikke over en anden rundtur.
  useEffect(() => {
    if (!brugerId || aktivRef.current || aktuelSide === "sag") return undefined;
    let sat = {};
    try { sat = laesSet(window.localStorage, brugerId); } catch (_) { sat = set; }
    const kandidat = skalStarteAutomatisk(guides, sat);
    if (!kandidat) return undefined;
    const t = setTimeout(() => { if (!aktivRef.current && document.visibilityState !== "hidden") start(kandidat.id); }, 1500);
    return () => clearTimeout(t);
  }, [brugerId, guides, aktuelSide, start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Første besøg på en side med sin egen rundtur: tilbyd den (aldrig tving). Først når den automatiske velkomst er set.
  const tilbud = (!aktiv && !skalStarteAutomatisk(guides, set)) ? tilbudForSide(guides, set, aktuelSide) : null;
  const afvisTilbud = useCallback((g) => {
    setAfvist((a) => ({ ...a, [g.id]: true }));
    try { markerSet(window.localStorage, brugerId, g.id); } catch (_) { /* ikke kritisk */ }
    setSet((s) => ({ ...s, [g.id]: Date.now() }));
  }, [brugerId]);

  const luk = useCallback(() => setAktiv(null), []);
  const guide = aktiv ? guides.find((g) => g.id === aktiv.guideId) : null;

  return (
    <RundvisningContext.Provider value={{ guides, start, set, aktuelSide }}>
      {children}
      {tilbud && !afvist[tilbud.id] && aktuelSide !== "sag" && <TilbudKort guide={tilbud} onStart={() => start(tilbud.id)} onAfvis={() => afvisTilbud(tilbud)} />}
      {guide && <Overlay guide={guide} index={aktiv.index} setIndex={(i) => setAktiv((a) => (a ? { ...a, index: i } : a))} onLuk={luk} />}
    </RundvisningContext.Provider>
  );
}

// Et lille, ikke-blokerende kort nederst: "Ny her? Se en kort rundtur". Vises kun første gang, og "Ikke nu" gør, at det ikke kommer igen.
function TilbudKort({ guide, onStart, onAfvis }) {
  const [synlig, setSynlig] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSynlig(true), 1200); return () => clearTimeout(t); }, [guide.id]);
  if (!synlig) return null;
  return (
    <div role="region" aria-label="Tilbud om rundtur" className="fixed z-[70] bottom-3 left-3 right-3 sm:right-auto sm:max-w-sm rounded-xl bg-white border border-brand shadow-xl p-3" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Ny her? Se en kort rundtur af {guide.titel.toLowerCase()}</p>
          <p className="text-xs text-muted">{guide.beskrivelse} Du kan altid finde den igen under Hjælp.</p>
        </div>
        <button type="button" onClick={onAfvis} aria-label="Luk tilbuddet" className="w-9 h-9 -m-1 shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand"><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={onStart} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand">Vis mig rundt</button>
        <button type="button" onClick={onAfvis} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted">Ikke nu</button>
      </div>
    </div>
  );
}

function Overlay({ guide, index, setIndex, onLuk }) {
  const antal = guide.trin.length;
  const trin = guide.trin[index];
  const [rect, setRect] = useState(null);
  const [vindue, setVindue] = useState({ b: window.innerWidth, h: window.innerHeight });
  const [kortH, setKortH] = useState(200);
  const kortRef = useRef(null);
  const blokeret = !trin.fortsaetNaar;

  // Mål elementet igen ved rulning, ændret størrelse og når siden ændrer sig (elementet kan dukke op senere).
  useEffect(() => {
    let raf = 0;
    const maal = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVindue({ b: window.innerWidth, h: window.innerHeight });
        const el = finder(trin.maal);
        if (!el) { setRect(null); return; }
        const r = el.getBoundingClientRect();
        setRect((fo) => (fo && fo.top === r.top && fo.left === r.left && fo.width === r.width && fo.height === r.height ? fo : { top: r.top, left: r.left, width: r.width, height: r.height }));
      });
    };
    // Er elementet uden for synsfeltet, rulles det ind (sticky menu ligger altid i synsfeltet og rulles ikke).
    const el = finder(trin.maal);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) el.scrollIntoView({ block: "center", inline: "center" });
    }
    maal();
    window.addEventListener("scroll", maal, true);
    window.addEventListener("resize", maal);
    const poll = setInterval(maal, 400);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", maal, true); window.removeEventListener("resize", maal); clearInterval(poll); };
  }, [trin.maal, index]);

  // Trin, der venter på, at brugeren trykker på en knap: gå videre, når det næste element findes.
  useEffect(() => {
    if (!trin.fortsaetNaar) return undefined;
    const t = setInterval(() => { if (finder(trin.fortsaetNaar)) setIndex(naesteIndex(index, antal)); }, 250);
    return () => clearInterval(t);
  }, [trin.fortsaetNaar, index, antal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kortets egen højde (til placeringen) og fokus ved hvert trin.
  useLayoutEffect(() => {
    const h = kortRef.current?.offsetHeight;
    if (h && Math.abs(h - kortH) > 1) setKortH(h);
  });
  useEffect(() => { kortRef.current?.focus({ preventScroll: true }); }, [index]);

  const placering = placerKort({ rect, vindue, kort: { b: 340, h: kortH } });
  // Mobil: kortet dækker bunden af skærmen. Giv siden plads under sig, så også elementer nederst på siden kan rulles op over kortet.
  const iBund = placering.type === "bund";
  useEffect(() => {
    if (!iBund) return undefined;
    const foer = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${kortH + 32}px`;
    return () => { document.body.style.paddingBottom = foer; };
  }, [iBund, kortH]);
  // Mobil: ligger elementet bag kortet, rulles siden, så det kommer op over det.
  useEffect(() => {
    if (placering.type === "bund" && placering.skalRulles && rect) {
      window.scrollBy({ top: rect.top + rect.height + 12 - placering.top + 8 });
    }
  }, [placering.type, placering.skalRulles, rect?.top]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onLuk(); return; }
      // Holder tastaturfokus i kortet, så længe resten af siden er blokeret.
      if (e.key === "Tab" && blokeret && kortRef.current) {
        const knapper = [...kortRef.current.querySelectorAll("button:not([disabled])")];
        if (knapper.length === 0) return;
        const foerste = knapper[0], sidste = knapper[knapper.length - 1];
        if (e.shiftKey && (document.activeElement === foerste || document.activeElement === kortRef.current)) { e.preventDefault(); sidste.focus(); }
        else if (!e.shiftKey && document.activeElement === sidste) { e.preventDefault(); foerste.focus(); }
        else if (!kortRef.current.contains(document.activeElement)) { e.preventDefault(); foerste.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [blokeret, onLuk]);

  const sidste = erSidsteTrin(index, antal);
  const knapCls = "min-h-[44px] px-4 rounded-lg text-sm font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand transition-colors";

  return (
    <>
      {blokeret && <div className={`fixed inset-0 z-[80] ${rect ? "" : "bg-black/55"}`} aria-hidden="true" />}
      {rect && (
        <div
          aria-hidden="true"
          className="fixed z-[80] rounded-lg pointer-events-none ring-2 ring-brand"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
        />
      )}
      <div
        ref={kortRef} tabIndex={-1} role="dialog" aria-modal={blokeret ? "true" : "false"} aria-labelledby="rundvisning-titel" aria-describedby="rundvisning-tekst"
        className="fixed z-[81] rounded-xl bg-white border border-line shadow-xl p-4 focus:outline-none"
        style={{ top: placering.top, left: placering.left, width: placering.bredde }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{guide.titel} · Trin {index + 1} af {antal}</p>
        <h2 id="rundvisning-titel" className="font-display text-xl uppercase tracking-wide text-ink mb-1">{trin.titel}</h2>
        <p id="rundvisning-tekst" className="text-sm text-ink mb-4">{trin.tekst}</p>
        {trin.fortsaetNaar && <p className="text-xs font-semibold text-brand mb-3" role="status">Tryk på den markerede knap for at fortsætte.</p>}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button type="button" onClick={onLuk} className={`${knapCls} text-muted hover:text-ink`}>{sidste ? "Luk" : "Spring over"}</button>
          <div className="flex items-center gap-2">
            {index > 0 && <button type="button" onClick={() => setIndex(forrigeIndex(index))} className={`${knapCls} border border-line text-muted hover:border-muted`}>Tilbage</button>}
            {!trin.fortsaetNaar && (
              <button type="button" onClick={() => (sidste ? onLuk() : setIndex(naesteIndex(index, antal)))} className={`${knapCls} text-white bg-brand hover:bg-brand-dark`}>{sidste ? "Færdig" : "Næste"}</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Hjælp-knappen i topmenuen: viser de rundture, brugeren kan starte. Findes ingen (montør), vises intet.
export function HjaelpKnap() {
  const ctx = useRundvisning();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const udenfor = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const taste = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", udenfor);
    document.addEventListener("touchstart", udenfor);
    window.addEventListener("keydown", taste);
    return () => { document.removeEventListener("mousedown", udenfor); document.removeEventListener("touchstart", udenfor); window.removeEventListener("keydown", taste); };
  }, [open]);
  if (!ctx || ctx.guides.length === 0) return null;
  const herGuide = guideForSide(ctx.guides, ctx.aktuelSide);
  const grupper = grupperGuides(ctx.guides);
  const vaelg = (id) => { setOpen(false); ctx.start(id); };
  const antalNye = ctx.guides.filter((g) => !ctx.set?.[g.id]).length;
  return (
    <div ref={ref} className="relative shrink-0" data-rundvisning="hjaelp">
      <button
        onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Hjælp og rundvisning" title="Hjælp"
        className="relative w-10 h-10 rounded-lg bg-black border border-[#333] flex items-center justify-center text-brand hover:text-white hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors"
      >
        <HelpCircle size={16} aria-hidden="true" />
        {antalNye > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-brand border border-black" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[92vw] max-h-[75vh] overflow-y-auto bg-white rounded-lg border border-line shadow-lg z-30 text-left p-2">
          {herGuide && (
            <div className="mb-1 pb-2 border-b border-divider">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand px-2 py-1.5">Til denne side</p>
              <GuideKnap g={herGuide} set={ctx.set} onVaelg={vaelg} fremhaev />
            </div>
          )}
          {grupper.map((gr) => (
            <div key={gr.navn} className="mb-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted px-2 py-1.5">{gr.navn}</p>
              {gr.guides.map((g) => <GuideKnap key={g.id} g={g} set={ctx.set} onVaelg={vaelg} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GuideKnap({ g, set, onVaelg, fremhaev }) {
  const set_ = !!set?.[g.id];
  return (
    <button onClick={() => onVaelg(g.id)} className={`w-full text-left rounded-lg hover:bg-panel px-2 py-2.5 min-h-[44px] transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${fremhaev ? "bg-panel" : ""}`}>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink flex-1">{g.titel}</span>
        {set_
          ? <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Check size={12} aria-hidden="true" /> Set · se igen</span>
          : <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Ny</span>}
      </span>
      <span className="block text-xs text-muted">{g.beskrivelse}</span>
    </button>
  );
}
