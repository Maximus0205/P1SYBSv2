import React, { useState } from "react";
import { Info, Plus, X } from "lucide-react";
import { matchingAddressNotes } from "../data/domain";

// ---------------------------------------------------------------------------
// ADRESSE-NOTER / VIDENSDELING (september 2026)
//
// Viser eksisterende viden om en adresse (matchet via buildingKey - samme
// "opgang"-genkendelse som resten af appen bruger, se
// CustomerHistoryLookup/SuggestedDates i OrderFormFields.jsx), og lader
// montør/sælger tilføje ny viden. Se hooks/useAddressNotes.js og
// lib/dataStore.js: address_notes.
//
// GENBRUGES TRE STEDER - samme komponent, så en note ser ens ud og
// opfører sig ens, uanset hvor man møder den:
//   - NewOrderForm (under adressefeltet, MENS man booker - "undervejs i
//     bookingen", jf. ønsket) - sælgeren kan både SE og TILFØJE her.
//   - OrderView (sælgerens sagsvisning af en allerede booket sag).
//   - TechnicianOrderDetail (montørens sagsvisning) - den primære kilde:
//     montøren er den, der reelt STÅR på adressen og opdager forholdet.
//
// BEVIDST INGEN REDIGERING, kun tilføj/fjern - det er korte, punktvise
// observationer ("hund på adressen", "kode 1234"), ikke et dokument der
// skal holdes ajour. Er en oplysning forældet, fjernes den og en ny
// tilføjes - det er hurtigere end en redigeringsflow for noget så kort.
function AddressNotesPanel({ addressNotes, address, onAdd, canAdd, canDelete, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!address || address.trim().length < 5) return null;
  const matches = matchingAddressNotes(addressNotes, address);
  if (matches.length === 0 && !canAdd) return null;

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true); setError("");
    const result = await onAdd(text.trim());
    setSaving(false);
    if (result && result.ok === false) { setError(result.fejl || "Kunne ikke gemme."); return; }
    setText("");
    setAdding(false);
  };

  return (
    <div className={`rounded-xl border p-3 mb-4 ${matches.length > 0 ? "border-brand bg-brand/5" : "border-line bg-panel"}`}>
      {matches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand flex items-center gap-1.5">
            <Info size={13} className="shrink-0" aria-hidden="true" /> Kendt om denne adresse
          </p>
          {matches.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-2 rounded-lg bg-white border border-line px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-ink">{n.note}</p>
                <p className="text-[10px] text-muted mt-0.5">
                  {n.createdBy?.navn ? `${n.createdBy.navn} · ` : ""}{n.createdAt ? new Date(n.createdAt).toLocaleDateString("da-DK") : ""}
                </p>
              </div>
              {canDelete && onDelete && (
                <button onClick={() => onDelete(n.id)} aria-label="Fjern denne note" title="Fjern (fx forældet)" className="shrink-0 w-9 h-9 -m-1 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger">
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        adding ? (
          <div className={matches.length > 0 ? "mt-3 pt-3 border-t border-divider" : ""}>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Fx 'Hund på adressen, ring før ankomst' eller 'Kode til opgang: 1234'"
              aria-label="Ny info om adressen"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand mb-2"
            />
            {error && <p className="text-xs text-danger mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={submit} disabled={saving || !text.trim()} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50">
                {saving ? "Gemmer..." : "Gem"}
              </button>
              <button onClick={() => { setAdding(false); setText(""); setError(""); }} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors">
                Annuller
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1.5 ${matches.length > 0 ? "mt-2" : ""}`}>
            <Plus size={13} aria-hidden="true" /> {matches.length > 0 ? "Tilføj mere" : "Flag noget værd at vide om denne adresse"}
          </button>
        )
      )}
    </div>
  );
}

export { AddressNotesPanel };
