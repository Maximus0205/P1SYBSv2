import React, { useMemo, useState } from "react";
import { MapPin, Plus, X, Search } from "lucide-react";
import { AddressInput } from "../components/AddressInput";

// ---------------------------------------------------------------------------
// ADRESSER (september 2026) - selvstændig fane, adskilt fra sagskortet
//
// Tidligere lå "flag denne adresse" som en handling på selve sagen
// (OrderView/TechnicianOrderDetail) - men adressens forhold (nøgleboks,
// adgangskode, "smal opgang, kræver 2 mand") har reelt intet med den
// KONKRETE sag at gøre. Det er varig viden om ET STED, ikke om en bestemt
// kundeordre - og bør derfor kunne oprettes/vedligeholdes UAFHÆNGIGT af,
// om der overhovedet er en sag i gang der lige nu. En montør, der kører
// forbi eller lige har opdaget noget på en adresse UDEN en aktiv sag, skal
// kunne notere det her og da.
//
// Sagskortene (OrderView.jsx, TechnicianPage.jsx) og bookingflowet
// (NewOrderForm.jsx) viser stadig en RÅDGIVENDE ADVARSEL, hvis adressen
// allerede er flaget her - men opret/fjern sker udelukkende på denne
// side. Se hooks/useAddressNotes.js og lib/dataStore.js: address_notes.
//
// storeFocus (september 2026): butikkens egne koordinater ({lat, lon}),
// samme prop-navn/form som NewOrderForm allerede bruger - sendes videre
// til AddressInput, så adresseforslagene her OGSÅ prioriteres efter
// nærhed til butikken (se lib/geocoding.js: searchAddressSuggestions).
// Uden den ville denne ene formular være det eneste sted i appen, hvor
// forslagene IKKE var sorteret efter afstand.
function NewAddressNoteForm({ onAdd, storeFocus }) {
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!address.trim() || !note.trim()) return;
    setSaving(true); setError("");
    const result = await onAdd(address.trim(), note.trim());
    setSaving(false);
    if (result && result.ok === false) { setError(result.fejl || "Kunne ikke gemme."); return; }
    setAddress(""); setNote("");
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 mb-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3 flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Tilføj adresse-info</h3>
      <div className="grid gap-3 mb-3">
        <AddressInput value={address} onChange={setAddress} placeholder="Adresse" focus={storeFocus} />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Fx 'Nøgleboks ved siden af postkasserne, kode 4471' eller 'Meget smal opgang - kræver 2 mand'"
          aria-label="Info om adressen"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
        />
      </div>
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      <button
        onClick={submit}
        disabled={saving || !address.trim() || !note.trim()}
        className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
      >
        <Plus size={14} aria-hidden="true" /> {saving ? "Gemmer..." : "Gem"}
      </button>
    </div>
  );
}

// Grupperer de flade noter pr. addressKey (samme "opgang"-nøgle som resten
// af appen bruger, se buildingKey i domain.js), så flere noter om samme
// adresse vises samlet under ét overskrift i stedet for som løsrevne
// linjer. Gruppens overskrift bruger den SENEST tilføjede visningstekst -
// forskellige stavemåder af samme adresse (fx tilføjet af forskellige
// personer) er reelt samme sted, og den nyeste er typisk mest præcis.
function groupByAddress(addressNotes) {
  const byKey = new Map();
  (addressNotes || []).forEach((n) => {
    if (!byKey.has(n.addressKey)) byKey.set(n.addressKey, []);
    byKey.get(n.addressKey).push(n);
  });
  const groups = Array.from(byKey.entries()).map(([key, notes]) => {
    const sorted = [...notes].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return { key, display: sorted[0].addressDisplay || key, notes: sorted };
  });
  groups.sort((a, b) => a.display.localeCompare(b.display));
  return groups;
}

function AddressesPage({ addressNotes, onAdd, onDelete, canManage, storeFocus }) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => groupByAddress(addressNotes), [addressNotes]);
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.display.toLowerCase().includes(q) || g.notes.some((n) => (n.note || "").toLowerCase().includes(q)));
  }, [groups, search]);

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Vidensdeling</p>
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-2">Adresser</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Praktisk viden om en konkret adresse - fx hvor nøgleboksen sidder, en adgangskode, eller at opgangen er så smal at der altid kræves 2 mand. Uafhængig af den enkelte sag: gælder stedet, ikke en bestemt ordre. Vises automatisk som en advarsel, både når der bookes en ny sag, og på en eksisterende sag på adressen.
      </p>

      {canManage ? (
        <NewAddressNoteForm onAdd={onAdd} storeFocus={storeFocus} />
      ) : (
        <p className="text-xs text-muted italic mb-6">Du kan se, men ikke tilføje eller fjerne, adresse-info.</p>
      )}

      {groups.length > 0 && (
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg adresse eller note..."
            aria-label="Søg blandt adresser"
            className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-2.5 text-sm text-ink focus:outline-none focus:border-brand"
          />
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen adresser er flaget endnu.</p>
      ) : visibleGroups.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen adresser matcher "{search}".</p>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((g) => (
            <div key={g.key} className="rounded-xl border border-line bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-ink flex items-center gap-1.5 mb-2"><MapPin size={14} className="text-brand shrink-0" aria-hidden="true" /> {g.display}</p>
              <div className="space-y-1.5">
                {g.notes.map((n) => (
                  <div key={n.id} className="flex items-start justify-between gap-2 rounded-lg bg-panel px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{n.note}</p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {n.createdBy?.navn ? `${n.createdBy.navn} · ` : ""}{n.createdAt ? new Date(n.createdAt).toLocaleDateString("da-DK") : ""}
                      </p>
                    </div>
                    {canManage && onDelete && (
                      <button onClick={() => onDelete(n.id)} aria-label="Fjern denne note" title="Fjern (fx forældet)" className="shrink-0 w-9 h-9 -m-1 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger">
                        <X size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { AddressesPage };
