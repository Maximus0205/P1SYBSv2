import React, { useEffect, useState } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { hentKladdeIndstillinger, gemKladdeIndstillinger } from "../lib/kladdeIndstillinger";
import { saetKladdeIndstillinger, MIN_DAGE, MAKS_DAGE } from "../lib/orderDrafts";

// Admin -> Kladder (oktober 2026): butikkens administrator bestemmer, om parkerede bookinger er slået til, og hvor
// mange dage de ligger. En kladde indeholder kundens navn, telefon og adresse, så det er butikkens eget valg, hvor
// længe sådanne oplysninger må stå. Databasen håndhæver valget (se supabase/migrations/20261005_draft_settings.sql).
//
// Slås kladder fra, eller forkortes fristen, slettes de kladder, der ikke længere må ligge, MED DET SAMME og kan ikke
// gendannes - derfor en bekræftelse først.
function KladdeIndstillinger({ storeId }) {
  const [gemt, setGemt] = useState(null); // sidst kendte indstilling i databasen
  const [aktiveret, setAktiveret] = useState(true);
  const [dage, setDage] = useState("14");
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [kunneIkkeHentes, setKunneIkkeHentes] = useState(false);

  useEffect(() => {
    let levende = true;
    setGemt(null); setKunneIkkeHentes(false);
    hentKladdeIndstillinger(storeId).then((r) => {
      if (!levende) return;
      if (!r) { setKunneIkkeHentes(true); return; }
      setGemt(r); setAktiveret(r.aktiveret); setDage(String(r.dage));
    });
    return () => { levende = false; };
  }, [storeId]);

  const dageN = Number(dage);
  const gyldig = dage.trim() !== "" && Number.isInteger(dageN) && dageN >= MIN_DAGE && dageN <= MAKS_DAGE;
  const aendret = !!gemt && (aktiveret !== gemt.aktiveret || (gyldig && dageN !== gemt.dage));

  const gem = async () => {
    setFejl(""); setBesked("");
    if (!gyldig) { setFejl(`Antal dage skal være et helt tal mellem ${MIN_DAGE} og ${MAKS_DAGE}.`); return; }
    if (gemt.aktiveret && !aktiveret) {
      if (!window.confirm("Slå parkerede bookinger fra?\n\nAlle butikkens eksisterende kladder slettes med det samme og kan ikke gendannes, og sælgerne kan ikke længere parkere en booking.")) return;
    } else if (gemt.aktiveret && aktiveret && dageN < gemt.dage) {
      if (!window.confirm(`Forkort fristen til ${dageN} dage?\n\nKladder, der er ældre end ${dageN} dage, slettes med det samme og kan ikke gendannes.`)) return;
    }
    setBusy(true);
    const r = await gemKladdeIndstillinger({ aktiveret, dage: dageN, storeId });
    setBusy(false);
    if (!r.ok) { setFejl(r.fejl || "Indstillingen blev ikke gemt."); return; }
    const ny = { aktiveret, dage: dageN };
    setGemt(ny);
    saetKladdeIndstillinger(storeId, ny); // gælder med det samme på denne enhed
    setBesked(r.slettede > 0 ? `Gemt. ${r.slettede} ${r.slettede === 1 ? "kladde blev" : "kladder blev"} slettet.` : "Gemt.");
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm max-w-xl">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Parkerede bookinger (kladder)</h3>
      <p className="text-xs text-muted mb-4">
        Når en sælger bliver afbrudt midt i en booking, gemmes det tastede som en kladde, der følger sælgeren på tværs af enheder. En kladde indeholder kundens navn, telefon og adresse og kan kun ses af den sælger, der oprettede den.
      </p>

      {kunneIkkeHentes && <p className="text-xs text-danger mb-3 flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> Indstillingen kunne ikke hentes. Tjek forbindelsen og prøv igen.</p>}
      {!gemt && !kunneIkkeHentes && <p className="text-xs text-muted mb-3 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Henter...</p>}

      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
        <input type="checkbox" checked={aktiveret} disabled={!gemt || busy} onChange={(e) => { setAktiveret(e.target.checked); setBesked(""); }} className="w-5 h-5 accent-brand" />
        <span className="text-sm text-ink">Kladder er slået til</span>
      </label>

      <div className={`mt-3 ${aktiveret ? "" : "opacity-50"}`}>
        <label htmlFor="kladde-dage" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Hvor længe skal en kladde ligge?</label>
        <div className="flex items-center gap-2">
          <input
            id="kladde-dage" type="number" inputMode="numeric" min={MIN_DAGE} max={MAKS_DAGE} step="1"
            value={dage} disabled={!gemt || !aktiveret || busy}
            onChange={(e) => { setDage(e.target.value); setBesked(""); }}
            aria-describedby="kladde-dage-hjaelp"
            className="w-24 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand"
          />
          <span className="text-sm text-muted">dage</span>
        </div>
        <p id="kladde-dage-hjaelp" className="text-[11px] text-muted mt-1">Mellem {MIN_DAGE} og {MAKS_DAGE} dage. Derefter slettes kladden automatisk.</p>
      </div>

      {fejl && <p role="alert" className="text-xs text-danger mt-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {besked && <p role="status" className="text-xs text-success mt-3 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> {besked}</p>}

      <button
        onClick={gem} disabled={!aendret || busy}
        className="mt-4 min-h-[44px] px-5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
      >
        {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {busy ? "Gemmer..." : "Gem"}
      </button>
    </div>
  );
}

export { KladdeIndstillinger };
