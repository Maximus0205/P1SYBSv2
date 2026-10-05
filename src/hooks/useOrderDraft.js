import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gemKladde, fjernKladde, harIndhold, kladderAktiveret } from "../lib/orderDrafts";

// Gemmer en ufærdig booking løbende som en kladde - se lib/orderDrafts.js for
// hvorfor og hvordan. Bruges af NewOrderForm.
//
//   draftId  kladdens id (nyt for en ny booking, kladdens eget ved genoptagelse)
//   state    et samlet billede af ALLE formularens felter (memoiseret af kalderen)
//   step     hvilket trin brugeren er nået til
//   blank    { lineItem, keyAccess } fra en tom formular (til at se, om der er tastet noget)
//
// GEMMER PÅ TRE TIDSPUNKTER, så intet afhænger af, at brugeren selv "gemmer":
//   1. 0,7 sek. efter sidste ændring (så hvert tastetryk ikke skriver til disken)
//   2. når komponenten lukkes/forlades - fx ved skift til en anden fane i appen
//   3. når siden skjules eller lukkes (mobilbrowsere dræber ofte en baggrundsfane
//      uden at give React mulighed for at rydde op)
//
// afslut() kaldes, når sagen ER booket eller kladden bevidst kasseres: den
// fjerner kladden og forhindrer, at den bliver gemt igen bagefter.
export function useOrderDraft({ draftId, storeId, userId, state, step, blank }) {
  const [gemtTid, setGemtTid] = useState(null);
  const [fejl, setFejl] = useState(false);
  const afsluttetRef = useRef(false);
  const indhold = useMemo(() => harIndhold(state, blank), [state, blank]);
  const seneste = useRef(null);
  seneste.current = { draftId, storeId, userId, state, step, indhold };

  const flush = useCallback(() => {
    const l = seneste.current;
    if (afsluttetRef.current || !l.storeId || !l.userId) return;
    // Slået fra af butikkens administrator: der parkeres intet, og formularen viser hverken "gemt" eller en fejl.
    if (!kladderAktiveret(l.storeId)) return;
    if (!l.indhold) {
      // Er alt slettet igen, er der ingenting at parkere.
      fjernKladde(l.draftId);
      setGemtTid(null);
      return;
    }
    const r = gemKladde({ id: l.draftId, storeId: l.storeId, userId: l.userId, state: l.state, step: l.step });
    if (r.ok) { setGemtTid(r.savedAt); setFejl(false); } else { setFejl(true); }
  }, []);

  useEffect(() => {
    const t = setTimeout(flush, 700);
    return () => clearTimeout(t);
  }, [state, step, indhold, userId, flush]);

  useEffect(() => {
    const vedSkjul = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", vedSkjul);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", vedSkjul);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const afslut = useCallback(() => {
    afsluttetRef.current = true;
    fjernKladde(seneste.current.draftId);
    setGemtTid(null);
  }, []);

  return { gemtTid, fejl, harIndhold: indhold, afslut };
}
