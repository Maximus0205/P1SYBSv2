import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

// BILLEDFORSTØRRELSE (oktober 2026): fuldskærmsvisning af et billede fra en sag.
// Miniaturerne under en ordre er 128 px høje - for små til at se, om en
// installation er udført rigtigt. Trykker man på et billede, åbnes det her
// så stort som skærmen tillader, uden at beskære det.
//
// Billederne er allerede komprimeret til maks. 1600 px ved upload (se
// komprimerBillede i OrderParts.jsx), så den forstørrede visning bruger
// samme fil som miniaturen - der hentes ikke et nyt, større billede.
//
// BRUG PÅ TOUCH: stryg til siden for forrige/næste billede. Knibning
// (pinch-zoom) overlades til browseren - vinduet fylder hele skærmen, så
// en tommelfinger-knibning zoomer ind på billedet som i enhver
// galleri-visning.
//
// BRUG MED TASTATUR: Escape lukker, pil venstre/højre skifter billede, og
// fokus flyttes ind i vinduet og gives tilbage til det billede, der åbnede
// det. Escape-tasten stoppes, så den ikke ALSO lukker en sagsvisning bagved.
//
// images: [{ id, src, navn }] - src er den URL, der skal vises.
const SWIPE_GRAENSE = 50; // px, før en vandret bevægelse tæller som et stryg

function ImageLightbox({ images, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const dialogRef = useRef(null);
  const touchStartRef = useRef(null);
  const antal = images.length;

  // Skift billede - uden at løbe ud over enderne. Listen kan ændre sig, mens
  // vinduet er åbent (fx et billede slettet fra en anden enhed), så indekset
  // klemmes altid ind i det aktuelle interval.
  const safeIndex = Math.min(Math.max(index, 0), Math.max(antal - 1, 0));
  const gaaTil = (naeste) => setIndex(Math.min(Math.max(naeste, 0), antal - 1));

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const antalRef = useRef(antal);
  antalRef.current = antal;

  useEffect(() => {
    const tidligere = document.activeElement;
    dialogRef.current?.focus();
    const overflowFoer = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onCloseRef.current();
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "ArrowRight") {
        setIndex((i) => Math.min(i + 1, antalRef.current - 1));
      }
    };
    // Capture: lyt FØR andre vinduers egne Escape-håndterere.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflowFoer;
      if (tidligere && typeof tidligere.focus === "function") tidligere.focus();
    };
  }, []);

  // Er der slet ingen billeder tilbage (alle slettet), lukkes vinduet af sig selv.
  useEffect(() => { if (antal === 0) onCloseRef.current(); }, [antal]);

  if (antal === 0) return null;
  const aktuelt = images[safeIndex];

  const onTouchStart = (e) => {
    // Kun ét-fingers bevægelse er et stryg; to fingre er en knibning.
    touchStartRef.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const onTouchEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Tydeligt vandret bevægelse - ellers er det en lodret rulning/et tryk.
    if (Math.abs(dx) < SWIPE_GRAENSE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    gaaTil(safeIndex + (dx < 0 ? 1 : -1));
  };

  const pilCls = "absolute top-1/2 -translate-y-1/2 w-12 h-12 rounded-lg bg-black/50 hover:bg-black/70 text-white flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white disabled:opacity-30 disabled:cursor-not-allowed";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex flex-col"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Forstørret billede${aktuelt.navn ? `: ${aktuelt.navn}` : ""}`}
        className="flex-1 min-h-0 flex flex-col focus:outline-none"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-white">
          <p className="text-sm truncate min-w-0" aria-live="polite">
            {aktuelt.navn || "Billede"}
            {antal > 1 && <span className="font-mono text-xs text-white/70 ml-2">{safeIndex + 1} / {antal}</span>}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk billedet"
            className="shrink-0 w-11 h-11 rounded-lg bg-black/50 hover:bg-black/70 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div
          className="relative flex-1 min-h-0 flex items-center justify-center px-2 pb-3"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <img
            key={aktuelt.id}
            src={aktuelt.src}
            alt={aktuelt.navn || "Billede fra sagen"}
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
          />
          {antal > 1 && (
            <>
              <button type="button" onClick={() => gaaTil(safeIndex - 1)} disabled={safeIndex === 0} aria-label="Forrige billede" className={`${pilCls} left-2`}>
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => gaaTil(safeIndex + 1)} disabled={safeIndex === antal - 1} aria-label="Næste billede" className={`${pilCls} right-2`}>
                <ChevronRight size={24} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ImageLightbox;
