import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";
import { indsaetIndex, afledHandling, erGyldigtMaal, beskedEfterSlip } from "../lib/traekOgSlip";

// TRÆK OG SLIP AF SAGER I PLANLÆGNING (oktober 2026) - se lib/traekOgSlip.js for reglerne (hvad et træk må).
//
// ÉN KODE TIL MUS OG TOUCH: Pointer Events. Man trækker i et lille HÅNDTAG på kortet, ikke i hele kortet - så
// almindelig rulning på en telefon aldrig flytter en sag ved et uheld, og et tryk på kortet åbner stadig sagen.
// Håndtaget har touch-action: none (kun dér), så fingeren kan trække uden at siden ruller med.
//
// TASTATUR OG SKÆRMLÆSER: håndtaget er bevidst ikke fokuserbart. De samme handlinger findes som almindelige
// knapper (pile "tidligere/senere i ruten" og bil-vælgeren), og en besked læses op, når en sag er flyttet.
//
// UDFØRELSEN sker via de eksisterende, versionsstyrede funktioner (onSetVisitOrder / onAssign) - præcis som
// pilene og vælgeren, så en konflikt med en kollegas ændring håndteres som altid. Slip uden for en gyldig zone,
// Escape eller et afbrudt træk gør INTET.
//
// Under trækket rulles siden automatisk, når fingeren/musen nærmer sig skærmens kant (lange sider på mobil).

export const TraekContext = createContext(null);

const BEVAEGELSESGRAENSE = 6; // px, før et tryk på håndtaget tæller som et træk
const KANT = 72;              // px fra skærmens kant, hvor der rulles automatisk

export function KortTraekProvider({ onAssign, onSetVisitOrder, bilNavn, kundeNavn, children }) {
  const [drag, setDrag] = useState(null);   // { kilde, over } mens der trækkes
  const [besked, setBesked] = useState("");
  const funktioner = useRef({});
  funktioner.current = { onAssign, onSetVisitOrder, bilNavn, kundeNavn };
  const ghostRef = useRef(null);
  const sessionRef = useRef(null);

  const afslut = useCallback((udfoer) => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;
    cancelAnimationFrame(s.raf);
    window.removeEventListener("pointermove", s.onMove);
    window.removeEventListener("pointerup", s.onUp);
    window.removeEventListener("pointercancel", s.onCancel);
    window.removeEventListener("keydown", s.onKey, true);
    window.removeEventListener("blur", s.onCancel);
    document.body.style.userSelect = s.bodyUserSelect;
    document.body.style.webkitUserSelect = s.bodyUserSelect;
    try { s.element?.releasePointerCapture?.(s.pointerId); } catch (_) { /* allerede sluppet */ }

    if (udfoer && s.aktiv && s.over?.gyldig) {
      const handling = afledHandling(s.kilde, s.over);
      const f = funktioner.current;
      if (handling.type === "omraekker") f.onSetVisitOrder?.(handling.rowId, handling.day, handling.ids);
      else if (handling.type === "tildel") f.onAssign?.(handling.orderId, handling.vehicleId);
      setBesked(beskedEfterSlip(handling, { kundeNavn: s.kilde.label, bilNavn: handling.vehicleId ? f.bilNavn?.(handling.vehicleId) : undefined }));
    }
    setDrag(null);
  }, []);

  const start = useCallback((e, kilde) => {
    if (sessionRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const s = {
      kilde, pointerId: e.pointerId, element: e.currentTarget, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      aktiv: false, over: null, overNoegle: "", raf: 0, bodyUserSelect: document.body.style.userSelect,
    };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (_) { /* ikke kritisk */ }

    const tegn = () => {
      s.raf = requestAnimationFrame(tegn);
      if (!s.aktiv) return;
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${s.x + 14}px, ${s.y + 14}px)`;
      // Automatisk rulning nær kanten.
      const h = window.innerHeight;
      if (s.y < KANT) window.scrollBy(0, -Math.ceil((KANT - s.y) / 4));
      else if (s.y > h - KANT) window.scrollBy(0, Math.ceil((s.y - (h - KANT)) / 4));
      // Hvilken zone og hvilken plads er under markøren?
      let zone = null;
      for (const el of document.elementsFromPoint(s.x, s.y)) { zone = el.closest?.("[data-traek-zone]"); if (zone) break; }
      let over = null;
      if (zone) {
        const kort = [...zone.querySelectorAll("[data-traek-kort]")];
        const midt = kort.map((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2; });
        const mål = { rowId: zone.dataset.row || null, day: zone.dataset.day, index: indsaetIndex(midt, s.y) };
        over = { ...mål, gyldig: erGyldigtMaal(kilde, mål) };
      }
      const noegle = over ? `${over.rowId}|${over.day}|${over.index}|${over.gyldig}` : "";
      if (noegle !== s.overNoegle) {          // kun ny tegning, når målet ændrer sig
        s.overNoegle = noegle;
        s.over = over;
        setDrag({ kilde, over });
      }
      if (ghostRef.current) ghostRef.current.dataset.ugyldig = over && !over.gyldig ? "ja" : "nej";
    };

    s.onMove = (ev) => {
      if (ev.pointerId !== s.pointerId) return;
      s.x = ev.clientX; s.y = ev.clientY;
      if (!s.aktiv) {
        if (Math.hypot(s.x - s.startX, s.y - s.startY) < BEVAEGELSESGRAENSE) return;
        s.aktiv = true;
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
        setBesked("");
        setDrag({ kilde, over: null });
      }
      if (ev.cancelable) ev.preventDefault();
    };
    s.onUp = (ev) => { if (ev.pointerId === s.pointerId) afslut(true); };
    s.onCancel = () => afslut(false);
    s.onKey = (ev) => { if (ev.key === "Escape") { ev.stopImmediatePropagation(); afslut(false); } };

    sessionRef.current = s;
    window.addEventListener("pointermove", s.onMove, { passive: false });
    window.addEventListener("pointerup", s.onUp);
    window.addEventListener("pointercancel", s.onCancel);
    window.addEventListener("keydown", s.onKey, true);
    window.addEventListener("blur", s.onCancel);
    s.raf = requestAnimationFrame(tegn);
  }, [afslut]);

  // Forlader man siden midt i et træk, ryddes alt op.
  useEffect(() => () => afslut(false), [afslut]);

  const ghost = drag && typeof document !== "undefined" ? createPortal(
    <div
      ref={(el) => {
        ghostRef.current = el;
        const s = sessionRef.current;
        if (el && s) el.style.transform = `translate(${s.x + 14}px, ${s.y + 14}px)`;
      }}
      aria-hidden="true"
      className="fixed left-0 top-0 z-[70] pointer-events-none max-w-[16rem] truncate rounded-lg border border-brand bg-white px-3 py-2 text-sm font-semibold text-ink shadow-lg data-[ugyldig=ja]:border-danger data-[ugyldig=ja]:text-danger"
    >
      {drag.kilde.label || "Sag"}
    </div>,
    document.body,
  ) : null;

  return (
    <TraekContext.Provider value={{ drag, start }}>
      {children}
      {ghost}
      <div className="sr-only" role="status" aria-live="polite">{besked}</div>
    </TraekContext.Provider>
  );
}

// Håndtaget på et kort. Vises kun, når der er en trækkontekst (ellers er funktionen ikke slået til).
export function TraekHaandtag({ kilde }) {
  const ctx = useContext(TraekContext);
  if (!ctx || !kilde) return null;
  return (
    <span
      onPointerDown={(e) => ctx.start(e, kilde)}
      style={{ touchAction: "none" }}
      title="Træk for at flytte sagen"
      aria-hidden="true"
      className="w-9 h-9 -ml-1.5 -my-1 flex items-center justify-center rounded text-muted hover:text-brand cursor-grab active:cursor-grabbing select-none"
    >
      <GripVertical size={14} aria-hidden="true" />
    </span>
  );
}

// Den zone (bil + dag), et afsnit er, og om der trækkes hen over den lige nu.
export function useTraekZone(rowId, day) {
  const ctx = useContext(TraekContext);
  const drag = ctx?.drag || null;
  const over = drag?.over;
  const erOver = !!over && over.gyldig && (over.rowId || null) === (rowId || null) && over.day === day;
  const traekkerHer = !!drag && drag.kilde.day === day && (drag.kilde.rowId || null) === (rowId || null);
  return { aktiv: !!ctx, drag, erOver, traekkerHer, index: erOver ? over.index : null };
}

export const IndsaetLinje = () => <div className="h-0.5 rounded bg-brand my-0.5" aria-hidden="true" />;
