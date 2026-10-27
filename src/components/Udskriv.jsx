import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

// UDSKRIFT VIA BROWSERENS PRINT-DIALOG (oktober 2026). Dokumentet tegnes i en midlertidig beholder uden for appen (.print-root), siden får sin @page-størrelse,
// og window.print() åbner den almindelige dialog, hvor brugeren vælger printer (A4-laser, labelprinter m.fl.) eller "Gem som PDF".
// Beholderen og stilen fjernes igen, når udskriften er færdig eller annulleret. Se index.css (.print-root).
export function udskriv({ css, element }) {
  const beholder = document.createElement("div");
  beholder.className = "print-root";
  document.body.appendChild(beholder);
  const stil = document.createElement("style");
  stil.setAttribute("data-udskrift", "1");
  stil.textContent = css;
  document.head.appendChild(stil);
  const root = createRoot(beholder);
  flushSync(() => root.render(element));
  document.body.classList.add("udskriver");
  let ryddet = false;
  const ryd = () => {
    if (ryddet) return;
    ryddet = true;
    window.removeEventListener("afterprint", ryd);
    document.body.classList.remove("udskriver");
    try { root.unmount(); } catch (_) { /* ignorér */ }
    beholder.remove();
    stil.remove();
  };
  window.addEventListener("afterprint", ryd);
  // Giver browseren et øjeblik til at tegne (SVG og skrifter), før dialogen åbner.
  setTimeout(() => {
    try { window.print(); } catch (_) { ryd(); }
    setTimeout(ryd, 120000); // sikkerhedsnet, hvis afterprint aldrig kommer (nogle browsere)
  }, 150);
}
