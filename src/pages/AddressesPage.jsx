import React, { useMemo, useState } from "react";
import { MapPin, Plus, X, Search, KeyRound, Pencil, Building2 } from "lucide-react";
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

// ---------------------------------------------------------------------------
// NØGLESKABE (september 2026)
//
// Digitalisering af de laminerede ark, der i dag ligger i hver bil: for
// boligforeninger med et fysisk nøgleskab (fx ved ejendomsmesterkontoret),
// hvilket OMRÅDE dækker det skab, og hvor skabet selv sidder - fx "Bosera
// afd. 5 – Parkvej/Odensevej" -> skab ved Jacob Hansens vej 18H, dækker
// "Parkvej 1-7 & 8-26 samt Odensevej 9A-F".
//
// "omraade" ER BEVIDST FRI TEKST, ikke en struktureret liste af adresser.
// Et skab dækker typisk husnummerintervaller på tværs af flere veje ("1-7
// & 8-26", "9A-F") - at forsøge at parse og matche den slags automatisk
// mod en konkret sags adresse ville kræve en pålidelig adresseinterval-
// parser, som let ville fejle stille på en afvigende stavemåde og vise et
// forkert (eller intet) skab. Digitaliseret 1:1 som det laminerede ark er
// derfor den sikre løsning: samme information, søgbar på skrift/afdeling/
// vejnavn, uden at foregive en præcision der ikke er der. Findes en sag
// senere, kan en mere præcis kobling bygges oven på denne liste.
function NewKeyCabinetForm({ onAdd }) {
  const [navn, setNavn] = useState("");
  const [skabPlacering, setSkabPlacering] = useState("");
  const [omraade, setOmraade] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!navn.trim() || !skabPlacering.trim() || !omraade.trim()) return;
    setSaving(true); setError("");
    const result = await onAdd({ navn, skabPlacering, omraade, note });
    setSaving(false);
    if (!result.ok) { setError(result.fejl || "Kunne ikke gemme."); return; }
    setNavn(""); setSkabPlacering(""); setOmraade(""); setNote("");
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 mb-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3 flex items-center gap-1.5"><Plus size={15} aria-hidden="true" /> Tilføj nøgleskab</h3>
      <div className="grid gap-3 mb-3">
        <input
          value={navn}
          onChange={(e) => setNavn(e.target.value)}
          placeholder="Navn, fx 'Bosera afd. 5 – Parkvej/Odensevej'"
          aria-label="Navn på boligforening/afdeling"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
        />
        <input
          value={skabPlacering}
          onChange={(e) => setSkabPlacering(e.target.value)}
          placeholder="Hvor skabet sidder, fx 'Ved ejendomsmesterkontor, Jacob Hansens vej 18H'"
          aria-label="Skabets placering"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
        />
        <textarea
          value={omraade}
          onChange={(e) => setOmraade(e.target.value)}
          rows={2}
          placeholder="Hvilket område skabet dækker, fx 'Parkvej 1-7 & 8-26 samt Odensevej 9A-F'"
          aria-label="Område skabet dækker"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ekstra info (valgfri), fx kode til skabet eller hvem man kontakter hvis det er tomt"
          aria-label="Ekstra info"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
        />
      </div>
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      <button
        onClick={submit}
        disabled={saving || !navn.trim() || !skabPlacering.trim() || !omraade.trim()}
        className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
      >
        <Plus size={14} aria-hidden="true" /> {saving ? "Gemmer..." : "Gem"}
      </button>
    </div>
  );
}

// Redigering foregår direkte i kortet (ingen separat popup) - der er
// typisk kun en håndfuld nøgleskabe pr. butik, og felterne er de samme som
// ved oprettelse, så en dedikeret redigeringsformular ville bare gentage
// NewKeyCabinetForm for ingen ekstra klarheds skyld.
function KeyCabinetCard({ cabinet, canManage, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [navn, setNavn] = useState(cabinet.navn);
  const [skabPlacering, setSkabPlacering] = useState(cabinet.skabPlacering);
  const [omraade, setOmraade] = useState(cabinet.omraade);
  const [note, setNote] = useState(cabinet.note || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!navn.trim() || !skabPlacering.trim() || !omraade.trim()) return;
    setSaving(true);
    const ok = await onUpdate(cabinet.id, { navn: navn.trim(), skabPlacering: skabPlacering.trim(), omraade: omraade.trim(), note: note.trim() });
    setSaving(false);
    if (ok) setEditing(false);
  };

  const cancel = () => {
    setNavn(cabinet.navn); setSkabPlacering(cabinet.skabPlacering); setOmraade(cabinet.omraade); setNote(cabinet.note || "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-brand bg-white p-4 shadow-sm">
        <div className="grid gap-2 mb-3">
          <input autoFocus value={navn} onChange={(e) => setNavn(e.target.value)} aria-label="Navn" className="w-full rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <input value={skabPlacering} onChange={(e) => setSkabPlacering(e.target.value)} aria-label="Skabets placering" className="w-full rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <textarea value={omraade} onChange={(e) => setOmraade(e.target.value)} rows={2} aria-label="Område" className="w-full rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ekstra info (valgfri)" aria-label="Ekstra info" className="w-full rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60">{saving ? "Gemmer..." : "Gem"}</button>
          <button onClick={cancel} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted hover:text-ink">Fortryd</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-ink flex items-center gap-1.5 min-w-0"><Building2 size={14} className="text-brand shrink-0" aria-hidden="true" /> <span className="truncate">{cabinet.navn}</span></p>
        {canManage && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => setEditing(true)} aria-label={`Ret ${cabinet.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand"><Pencil size={13} aria-hidden="true" /></button>
            {onDelete && <button onClick={() => onDelete(cabinet.id)} aria-label={`Slet ${cabinet.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"><X size={14} aria-hidden="true" /></button>}
          </div>
        )}
      </div>
      <p className="text-sm text-ink mb-1.5">{cabinet.omraade}</p>
      <p className="text-xs text-muted flex items-start gap-1.5 mb-1"><KeyRound size={12} className="shrink-0 mt-0.5" aria-hidden="true" /> Skab: {cabinet.skabPlacering}</p>
      {cabinet.note && <p className="text-xs text-brand mt-1.5">{cabinet.note}</p>}
      <p className="text-[10px] text-muted mt-2">
        {cabinet.createdBy?.navn ? `${cabinet.createdBy.navn} · ` : ""}{cabinet.createdAt ? new Date(cabinet.createdAt).toLocaleDateString("da-DK") : ""}
      </p>
    </div>
  );
}

function KeyCabinetsSection({ keyCabinets, onAdd, onUpdate, onDelete, canManage }) {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keyCabinets;
    return (keyCabinets || []).filter((c) =>
      c.navn.toLowerCase().includes(q) || c.omraade.toLowerCase().includes(q) || c.skabPlacering.toLowerCase().includes(q)
    );
  }, [keyCabinets, search]);

  return (
    <div className="mt-10">
      <h2 className="font-display text-2xl uppercase tracking-tight text-ink mb-2 flex items-center gap-2"><KeyRound size={20} className="text-brand" aria-hidden="true" /> Nøgleskabe</h2>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Boligforeningers fysiske nøgleskabe (fx ved ejendomsmesterkontoret) - hvilket område et skab dækker, og hvor skabet selv sidder. Erstatter de laminerede ark i bilerne.
      </p>

      {canManage ? (
        <NewKeyCabinetForm onAdd={onAdd} />
      ) : (
        <p className="text-xs text-muted italic mb-6">Du kan se, men ikke tilføje eller ændre, nøgleskabe.</p>
      )}

      {keyCabinets.length > 0 && (
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg på navn, vej eller afdeling..."
            aria-label="Søg blandt nøgleskabe"
            className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-2.5 text-sm text-ink focus:outline-none focus:border-brand"
          />
        </div>
      )}

      {keyCabinets.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen nøgleskabe oprettet endnu.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen nøgleskabe matcher "{search}".</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {visible.map((c) => (
            <KeyCabinetCard key={c.id} cabinet={c} canManage={canManage} onUpdate={onUpdate} onDelete={canManage ? onDelete : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddressesPage({ addressNotes, onAdd, onDelete, canManage, storeFocus, keyCabinets, onAddKeyCabinet, onUpdateKeyCabinet, onDeleteKeyCabinet }) {
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

      {/* NØGLESKABE (september 2026): egen sektion nedenfor - se noten ved
          KeyCabinetsSection for hvorfor det er en selvstændig liste og
          ikke en udvidelse af adresse-noterne ovenfor. */}
      <KeyCabinetsSection
        keyCabinets={keyCabinets || []}
        onAdd={onAddKeyCabinet}
        onUpdate={onUpdateKeyCabinet}
        onDelete={onDeleteKeyCabinet}
        canManage={canManage}
      />
    </div>
  );
}

export { AddressesPage };
