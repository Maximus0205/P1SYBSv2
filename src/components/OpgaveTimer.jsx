import React, { useEffect, useState } from "react";
import { Pause } from "lucide-react";
import { samletMs, formaterTid, erPauset } from "../lib/opgaveTid";

// Tidstæller på en opgave, der er startet (oktober 2026). Tæller sekund for sekund, mens opgaven kører, og
// står stille med et pause-tegn, når den er sat på pause (fx markeret "kom ikke i mål"). Vises ikke for en
// opgave, der ikke er startet eller er færdigmeldt. Se lib/opgaveTid.js for hvordan tiden regnes.
//
// stor: den store udgave på sagens egen side; ellers den lille på rutekortet.
// role="timer" læses ikke højt hvert sekund (live-region er slået fra for den rolle).
function OpgaveTimer({ order, stor = false }) {
  const koerer = !!order?.stemplerInd;
  const pauset = erPauset(order);
  const [, taek] = useState(0);

  useEffect(() => {
    if (!koerer) return undefined;
    const t = setInterval(() => taek((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [koerer]);

  if (!koerer && !pauset) return null;
  const tid = formaterTid(samletMs(order, Date.now()));

  if (stor) {
    return (
      <div className="flex items-center gap-2" role="timer" aria-label={`Tid på opgaven: ${tid}${pauset ? ", på pause" : ""}`}>
        {pauset
          ? <Pause size={20} className="text-muted shrink-0" aria-hidden="true" />
          : <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse motion-reduce:animate-none shrink-0" aria-hidden="true" />}
        <span className={`font-mono tabular-nums text-3xl leading-none ${pauset ? "text-muted" : "text-ink"}`}>{tid}</span>
        {pauset && <span className="text-xs font-semibold uppercase tracking-wide text-muted">Pause</span>}
      </div>
    );
  }
  return (
    <span className={`font-mono tabular-nums text-[11px] flex items-center gap-1 ${pauset ? "text-muted" : "text-brand"}`} role="timer" aria-label={`Tid på opgaven: ${tid}${pauset ? ", på pause" : ""}`}>
      {pauset
        ? <Pause size={10} aria-hidden="true" />
        : <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse motion-reduce:animate-none" aria-hidden="true" />}
      {tid}{pauset ? " pause" : ""}
    </span>
  );
}

export { OpgaveTimer };
