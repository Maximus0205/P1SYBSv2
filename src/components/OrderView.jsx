import React, { useState } from "react";
import { KeyRound, Building2, Hash, Pencil, X, Check, Copy, AlertTriangle, User, Lock, Trash2, Plus, RotateCw } from "lucide-react";
import { TIME_SLOTS, buildTitle, keyAccessText, timeSlotById, timeSlotText, lineItemLabel, canDo, createLineItem, missingLineItems, OTHER_PRODUCT_TYPE_ID } from "../data/domain";
import { StatusBadge } from "../components/common";
import { LineItemDetails, Notes, Photos, Reports, TimeLog } from "../components/OrderParts";
import { AddressInput } from "../components/AddressInput";

// Hurtig-redigering af en booket sag: dato, tidsrum, montør og
// leveringsadresse - de felter der oftest skal justeres efter oprettelse.
// Varelinjerne har deres egen editor (se LineItemEditor nedenfor).
//
// dato/tidsrum/montør (sag_planlaegning) og leveringsadresse (sag_kunde)
// er to FORSKELLIGE rettigheder. Mangler man den ene, låses de tilhørende
// felter i stedet for at hele redigeringen skjules - man kan sagtens have
// lov til at flytte datoen uden at måtte røre kundens adresse. Kun de
// felter man har lov til sendes med i onSave, så updateBooking (som slår
// sammen med eksisterende felter) ikke overskriver noget, man ikke havde
// adgang til.
function BookingEditor({ order, technicians, onSave, onCancel, permissions }) {
  const canPlan = canDo(permissions, "sag_planlaegning");
  const canEditCustomer = canDo(permissions, "sag_kunde");

  const [date, setDate] = useState(order.dato);
  const [timeSlotId, setTimeSlotId] = useState(order.tidsrumId);
  const [technicianId, setTechnicianId] = useState(order.montorId || "");
  const [address, setAddress] = useState(order.kunde.adresse);

  const save = () => {
    const fields = {};
    if (canPlan) {
      const t = timeSlotById(timeSlotId);
      Object.assign(fields, { dato: date, tidsrumId: timeSlotId, start: t.start, slut: t.slut, montorId: technicianId || null });
    }
    if (canEditCustomer) {
      fields.kunde = { ...order.kunde, adresse: address.trim() };
    }
    onSave(fields);
  };

  return (
    <div className="rounded-xl bg-white border border-brand p-4 mb-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Redigér booking</h3>
      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <label className="text-xs text-muted">
          Dato
          <input type="date" value={date || ""} disabled={!canPlan} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand disabled:opacity-60 disabled:cursor-not-allowed" />
        </label>
        <label className="text-xs text-muted">
          Tidsrum
          <select value={timeSlotId || "heldag"} disabled={!canPlan} onChange={(e) => setTimeSlotId(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand disabled:opacity-60 disabled:cursor-not-allowed">
            {TIME_SLOTS.map((t) => <option key={t.id} value={t.id}>{timeSlotText(t.id)}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Montør/bil
          <select value={technicianId} disabled={!canPlan} onChange={(e) => setTechnicianId(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand disabled:opacity-60 disabled:cursor-not-allowed">
            <option value="">Ikke tildelt</option>
            {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn} — {m.bil}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Leveringsadresse
          {canEditCustomer ? (
            <div className="mt-1"><AddressInput value={address} onChange={setAddress} placeholder="Leveringsadresse" /></div>
          ) : (
            <div className="mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted flex items-center gap-1.5"><Lock size={12} className="shrink-0" aria-hidden="true" /> {address || "Ingen adresse"}</div>
          )}
        </label>
      </div>
      {(!canPlan || !canEditCustomer) && (
        <p className="text-[11px] text-muted mb-3 flex items-center gap-1.5"><Lock size={11} className="shrink-0" aria-hidden="true" /> Nogle felter er låst - du mangler rettigheden til at redigere dem.</p>
      )}
      <div className="flex gap-2">
        <button onClick={save} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5"><Check size={14} aria-hidden="true" /> Gem ændringer</button>
        <button onClick={onCancel} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors flex items-center gap-1.5"><X size={14} aria-hidden="true" /> Annuller</button>
      </div>
    </div>
  );
}

// ---------------- Varelinje-editor (august 2026) ----------------
// Varelinjerne kunne kun sættes ved oprettelsen og var derefter låst. I
// praksis ændrer de sig løbende: kunden ombestemmer sig, en vare er
// oversolgt og skal skiftes til en tilsvarende model, eller der skal noget
// ekstra med.
//
// Redigeres LOKALT og gemmes først ved "Gem" - i modsætning til de fleste
// andre handlinger i appen. Man laver ofte flere sammenhængende rettelser
// (skift model OG ret tiden), og hvert tastetryk må ikke udløse en
// skrivning og en genberegning af hele planlægningen.
//
// Kræver sag_feltarbejde. Lageret har den bevidst ikke: de må melde en
// vare manglende, ikke omskrive hvad kunden har købt (håndhævet af
// orders_guard_field_groups i databasen - UI'et er ikke sikkerhedsgrænsen).
function LineItemEditor({ order, catalog, onSave, onCancel }) {
  const productTypes = catalog?.productTypes || [];
  const primaryServices = catalog?.primaryServices || [];
  const [items, setItems] = useState(() => order.varelinjer.map((v) => ({ ...v })));
  const [confirmRemove, setConfirmRemove] = useState(null);

  const patch = (id, fields) => setItems((prev) => prev.map((v) => (v.id === id ? { ...v, ...fields } : v)));

  const changeProductType = (id, varetypeId) => {
    const t = productTypes.find((p) => p.id === varetypeId);
    patch(id, { varetypeId, varetypeNavn: t ? t.navn : "Andet (skriv selv)" });
  };

  const changeService = (id, serviceId) => {
    const s = primaryServices.find((p) => p.id === serviceId);
    const current = items.find((v) => v.id === id);
    patch(id, { primaerYdelse: s ? { id: s.id, navn: s.navn, minutter: current?.primaerYdelse?.minutter || 0 } : null });
  };

  const addNew = () => {
    if (productTypes.length === 0 || primaryServices.length === 0) return;
    setItems((prev) => [...prev, createLineItem(productTypes, primaryServices)]);
  };

  return (
    <div className="rounded-xl bg-white border border-brand p-4 mb-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1">Redigér varelinjer</h3>
      <p className="text-xs text-muted mb-3">Ændringer gemmes først når du trykker Gem.</p>

      <div className="space-y-3 mb-3">
        {items.length === 0 && <p className="text-sm text-danger italic">Sagen har ingen varelinjer. Tilføj mindst én, eller annuller.</p>}
        {items.map((v) => (
          <div key={v.id} className="rounded-lg border border-line p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{lineItemLabel(v)}</p>
              <button
                onClick={() => setConfirmRemove(v.id)}
                aria-label={`Fjern ${lineItemLabel(v)}`}
                className="shrink-0 w-11 h-11 -m-2 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>

            {confirmRemove === v.id ? (
              <div className="rounded-lg bg-danger/10 border border-danger p-2.5">
                <p className="text-xs text-danger font-semibold">Fjern denne varelinje fra sagen?</p>
                <p className="text-[11px] text-danger mt-0.5">Det ændrer, hvad kunden har købt. Er varen allerede plukket, skal lageret have besked om at lægge den tilbage.</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setItems((prev) => prev.filter((x) => x.id !== v.id)); setConfirmRemove(null); }} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-danger hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink">Fjern</button>
                  <button onClick={() => setConfirmRemove(null)} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted">Behold</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted">
                  Varetype
                  <select value={v.varetypeId} onChange={(e) => changeProductType(v.id, e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
                    {productTypes.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
                    <option value={OTHER_PRODUCT_TYPE_ID}>Andet (skriv selv)</option>
                  </select>
                </label>
                {v.varetypeId === OTHER_PRODUCT_TYPE_ID && (
                  <label className="text-xs text-muted">
                    Beskrivelse
                    <input value={v.varetypeTekst || ""} onChange={(e) => patch(v.id, { varetypeTekst: e.target.value })} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
                  </label>
                )}
                <label className="text-xs text-muted">
                  Ydelse
                  <select value={v.primaerYdelse?.id || ""} onChange={(e) => changeService(v.id, e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
                    <option value="">Ingen</option>
                    {primaryServices.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted">
                  Mærke
                  <input value={v.maerke || ""} onChange={(e) => patch(v.id, { maerke: e.target.value })} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
                </label>
                <label className="text-xs text-muted">
                  Model
                  <input value={v.model || ""} onChange={(e) => patch(v.id, { model: e.target.value })} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
                </label>
                <label className="text-xs text-muted">
                  Forventet tid (minutter)
                  <input
                    type="number" min="0" inputMode="numeric"
                    value={v.primaerYdelse?.minutter ?? 0}
                    disabled={!v.primaerYdelse}
                    onChange={(e) => patch(v.id, { primaerYdelse: { ...v.primaerYdelse, minutter: Number(e.target.value) || 0 } })}
                    className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand disabled:opacity-60"
                  />
                </label>
                {v.mangler?.note && (
                  <p className="sm:col-span-2 text-[11px] text-danger flex items-start gap-1.5">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                    Lageret kan ikke finde denne vare ({v.mangler.note}). Skifter du varetype, mærke eller model, regnes meldingen som besvaret.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={addNew} disabled={productTypes.length === 0} className="mb-3 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:text-brand hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50">
        <Plus size={14} aria-hidden="true" /> Tilføj varelinje
      </button>

      <div className="flex gap-2">
        <button onClick={() => onSave(items)} disabled={items.length === 0} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
          <Check size={14} aria-hidden="true" /> Gem varelinjer
        </button>
        <button onClick={onCancel} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors flex items-center gap-1.5"><X size={14} aria-hidden="true" /> Annuller</button>
      </div>
    </div>
  );
}

// ---------------- Slet sag (august 2026) ----------------
// Kræver rettigheden sag_slet - admin og sælger har den, montør og lager
// ikke (håndhævet af RLS-policyen "delete orders with permission").
//
// Bekræftelsen nævner sagsnummer OG kundenavn, og lister hvad der
// forsvinder med. En sag er sjældent bare en linje i en liste: den kan
// have noter fra to kolleger, billeder fra installationen og registreret
// tid. Det skal man se, FØR man trykker - ikke opdage bagefter.
function DeleteOrderPanel({ order, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const mister = [
    order.noter?.length ? `${order.noter.length} ${order.noter.length === 1 ? "note" : "noter"}` : null,
    order.billeder?.length ? `${order.billeder.length} ${order.billeder.length === 1 ? "billede" : "billeder"}` : null,
    order.rapporter?.length ? `${order.rapporter.length} ${order.rapporter.length === 1 ? "rapport" : "rapporter"}` : null,
    order.logs?.length ? "registreret tid" : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl bg-white border border-danger p-4 mb-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-danger mb-1 flex items-center gap-1.5">
        <Trash2 size={14} aria-hidden="true" /> Slet sag #{order.nr} permanent?
      </h3>
      <p className="text-sm text-ink">{order.kunde?.navn}{order.kunde?.adresse ? ` · ${order.kunde.adresse}` : ""}</p>
      <p className="text-xs text-muted mt-1">{buildTitle(order.varelinjer)}</p>

      {mister.length > 0 && (
        <p className="text-xs text-danger mt-2">Følgende slettes med og kan ikke hentes tilbage: {mister.join(", ")}.</p>
      )}
      <p className="text-xs text-muted mt-2">
        Skal sagen bare ikke udføres, er det ofte bedre at færdigmelde den — så bevares historikken. Slet kun, hvis sagen aldrig skulle have været oprettet.
      </p>

      <div className="flex gap-2 mt-3">
        <button
          onClick={async () => { setBusy(true); const ok = await onConfirm(); if (!ok) setBusy(false); }}
          disabled={busy}
          className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-danger hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink transition-colors disabled:opacity-60"
        >
          {busy ? "Sletter..." : "Ja, slet sagen"}
        </button>
        <button onClick={onCancel} disabled={busy} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors disabled:opacity-60">Behold sagen</button>
      </div>
    </div>
  );
}

// Opretter en NY sag ud fra denne (dupliker/opfølgning).
function DuplicatePanel({ order, onDuplicate, onCancel }) {
  const [selected, setSelected] = useState(() => new Set(order.varelinjer.map((v) => v.id)));
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const submit = () => {
    const chosen = order.varelinjer.filter((v) => selected.has(v.id));
    if (chosen.length === 0) return;
    onDuplicate(chosen);
  };

  return (
    <div className="rounded-xl bg-white border border-brand p-4 mb-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-1.5"><Copy size={14} aria-hidden="true" /> Dupliker / opret opfølgning</h3>
      <p className="text-xs text-muted mb-3">Opretter en ny sag med samme kunde, adresse og nøgleoplysninger — dato og montør er ikke sat endnu og skal vælges bagefter. Vælg hvilke varelinjer der skal med.</p>
      <div className="space-y-1.5 mb-3">
        {order.varelinjer.map((v) => (
          <label key={v.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 cursor-pointer hover:border-brand transition-colors">
            <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} className="w-5 h-5 accent-brand shrink-0" />
            <span className="text-sm text-ink">{lineItemLabel(v)}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={selected.size === 0} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
          <Copy size={14} aria-hidden="true" /> Opret ny sag
        </button>
        <button onClick={onCancel} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors flex items-center gap-1.5"><X size={14} aria-hidden="true" /> Annuller</button>
      </div>
    </div>
  );
}

// Sælgerens visning af "lageret kan ikke finde denne vare". Står ØVERST i
// sagen og er bevidst påtrængende: det er den ene besked, hvor kunden
// risikerer et forgæves montørbesøg, hvis ingen reagerer.
//
// Teksten fortæller EKSPLICIT, hvad der får den til at forsvinde. Uden
// det ville den fremstå som en advarsel, man ikke kan slippe af med -
// og en advarsel, folk lærer at ignorere, er værre end ingen advarsel.
function MissingItemsBanner({ order, onClearMissingItem, canFieldwork }) {
  const mangler = missingLineItems(order);
  if (mangler.length === 0) return null;
  return (
    <div className="rounded-xl bg-danger/10 border border-danger p-4 mb-5" role="alert">
      <p className="text-sm font-semibold text-danger flex items-center gap-1.5">
        <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
        {mangler.length === 1 ? "Lageret kan ikke finde en vare til denne sag" : `Lageret kan ikke finde ${mangler.length} varer til denne sag`}
      </p>
      <div className="mt-2 space-y-1.5">
        {mangler.map((v) => (
          <div key={v.id} className="text-xs">
            <p className="font-semibold text-ink">{lineItemLabel(v)}</p>
            <p className="text-danger">{v.mangler.note}</p>
            <p className="text-muted">
              Meldt {v.mangler.tid}{v.mangler.meldtAf?.navn ? ` af ${v.mangler.meldtAf.navn}` : ""}
            </p>
            {canFieldwork && onClearMissingItem && (
              <button onClick={() => onClearMissingItem(v.id)} className="text-[11px] text-danger underline hover:no-underline mt-0.5 py-1">
                Afklaret med kunden — fjern markeringen
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted mt-2.5">
        Markeringen forsvinder af sig selv, når du booker sagen til en ny dato, eller når varen skiftes ud under "Redigér varelinjer".
      </p>
    </div>
  );
}

// ÆNDRET (september 2026): STATUS-SKIFTEREN OG STEMPLINGEN ER VÆK HERFRA.
//
// Status var et badge, man kunne klikke på, og som cyklede planlagt ->
// i gang -> afsluttet -> planlagt. To ting var galt med den. Det var
// uklart, hvad et klik ville gøre - man skulle kende rækkefølgen for at
// vide, hvor man landede - og et fejlklik på en afsluttet sag sendte den
// helt tilbage til "planlagt", uden at nogen blev spurgt.
//
// Stemplings-widgeten er også fjernet. Den hørte til montørens flow, hvor
// den nu er afløst af "Start opgave" og "Færdigmeld" - og efter den
// omlægning stod den her som en LÅST knap, en sælger hverken kunne eller
// skulle bruge. Den registrerede tid kan stadig ses under fanen "Tid".
//
// Status er nu udelukkende en VISNING her. En afsluttet sag kan dog
// GENÅBNES af en med feltarbejde-rettighed - fx hvis en montør
// færdigmeldte for tidligt. Uden den vej ville en fejl-færdigmelding være
// en blindgyde, og det er præcis den slags, der får folk til at oprette en
// dublet-sag i stedet.
function OrderView({ order, technicians, onBack, addNote, addPhoto, addReport, onToggleAddOn, onAddAddOn, onRemoveAddOn, onUpdateBooking, onDuplicate, onClearProblem, onOpenOrder, followUpOrder, originalOrder, permissions, catalog, onSetLineItems, onClearMissingItem, onDeleteOrder, onReopenOrder }) {
  const [tab, setTab] = useState("noter");
  // Kun ÉT panel ad gangen - to åbne redigeringer på samme sag ville både
  // fylde skærmen og gøre det uklart, hvad "Gem" gemmer.
  const [panel, setPanel] = useState(null); // "booking" | "varelinjer" | "dupliker" | "slet"
  const technician = technicians.find((m) => m.id === order.montorId);
  const canFieldwork = canDo(permissions, "sag_feltarbejde");
  const canPlan = canDo(permissions, "sag_planlaegning");
  const canEditCustomer = canDo(permissions, "sag_kunde");
  const canCreate = canDo(permissions, "sag_opret");
  const canDelete = canDo(permissions, "sag_slet");
  const tabs = [
    { key: "noter", label: "Noter", count: order.noter.length },
    { key: "materialer", label: "Materialer", count: (order.materialer || []).length },
    { key: "billeder", label: "Billeder", count: order.billeder.length },
    { key: "rapporter", label: "Rapporter", count: order.rapporter.length },
    { key: "tid", label: "Tid", count: order.logs.length },
  ];

  return (
    <div>
      <button onClick={onBack} className="text-sm text-muted hover:text-brand mb-4 flex items-center gap-1">← Tilbage</button>

      <MissingItemsBanner order={order} onClearMissingItem={onClearMissingItem} canFieldwork={canFieldwork} />

      {panel === "booking" ? (
        <BookingEditor
          order={order}
          technicians={technicians}
          permissions={permissions}
          onCancel={() => setPanel(null)}
          onSave={(fields) => { onUpdateBooking(fields); setPanel(null); }}
        />
      ) : panel === "varelinjer" ? (
        <LineItemEditor
          order={order}
          catalog={catalog}
          onCancel={() => setPanel(null)}
          onSave={(items) => { onSetLineItems?.(items); setPanel(null); }}
        />
      ) : panel === "dupliker" ? (
        <DuplicatePanel
          order={order}
          onCancel={() => setPanel(null)}
          onDuplicate={(selectedLineItems) => { onDuplicate?.(selectedLineItems); setPanel(null); }}
        />
      ) : panel === "slet" ? (
        <DeleteOrderPanel
          order={order}
          onCancel={() => setPanel(null)}
          onConfirm={() => onDeleteOrder?.()}
        />
      ) : (
        <div className="rounded-xl bg-white border border-line p-5 mb-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-mono text-xs text-muted mb-1">
                #{order.nr} · {order.dato || "ingen dato"} · {order.start}–{order.slut}{technician ? ` · ${technician.navn}` : " · ikke tildelt"}
                {order.ordrenummer && <span className="ml-2 inline-flex items-center gap-0.5"><Hash size={10} aria-hidden="true" /> {order.ordrenummer}</span>}
              </p>
              {order.oprettetAf?.navn && (
                <p className="text-xs text-muted mb-1 flex items-center gap-1"><User size={11} className="shrink-0" aria-hidden="true" /> Booket af {order.oprettetAf.navn}</p>
              )}
              <h1 className="font-display text-3xl uppercase tracking-tight text-ink leading-none">{buildTitle(order.varelinjer)}</h1>

              {order.problem && (
                <div className="mt-2.5 rounded-lg bg-danger/10 border border-danger px-3 py-2">
                  <p className="text-sm font-semibold text-danger flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" aria-hidden="true" /> Sagen kom ikke i mål</p>
                  <p className="text-xs text-danger mt-0.5">{order.problem.note} · {order.problem.tid}</p>
                  {onClearProblem && canFieldwork && <button onClick={onClearProblem} className="text-[11px] text-danger underline hover:no-underline mt-1 py-1">Ryd markering</button>}
                </div>
              )}
              {followUpOrder && onOpenOrder && (
                <button onClick={() => onOpenOrder(followUpOrder.id)} className="text-xs text-brand hover:underline mt-2 flex items-center gap-1"><Copy size={12} className="shrink-0" aria-hidden="true" /> Opfølgning oprettet: sag #{followUpOrder.nr}</button>
              )}
              {originalOrder && onOpenOrder && (
                <button onClick={() => onOpenOrder(originalOrder.id)} className="text-xs text-muted hover:text-brand mt-2 flex items-center gap-1"><Copy size={12} className="shrink-0" aria-hidden="true" /> Opfølgning på sag #{originalOrder.nr}</button>
              )}

              <p className="text-sm text-muted mt-2 font-semibold">Kunde (modtager)</p>
              <p className="text-sm text-muted">{order.kunde.navn}{order.kunde.telefon ? ` · ${order.kunde.telefon}` : ""}{order.kunde.email ? ` · ${order.kunde.email}` : ""}</p>
              <p className="text-sm text-muted">{order.kunde.adresse}</p>
              {order.kunde.leveringsnote && <p className="text-sm text-brand font-medium mt-1">⚠ {order.kunde.leveringsnote}</p>}
              {order.koeber && (
                <div className="mt-3 pt-3 border-t border-divider">
                  <p className="text-sm text-muted font-semibold flex items-center gap-1.5"><Building2 size={13} aria-hidden="true" /> Køber (afviger fra kunden)</p>
                  <p className="text-sm text-muted">{order.koeber.navn}{order.koeber.telefon ? ` · ${order.koeber.telefon}` : ""}{order.koeber.email ? ` · ${order.koeber.email}` : ""}</p>
                  {order.koeber.adresse && <p className="text-sm text-muted">{order.koeber.adresse}</p>}
                </div>
              )}
              {order.noegle?.kraeves && (
                <p className="text-sm text-brand font-semibold mt-2 flex items-center gap-1.5"><KeyRound size={14} aria-hidden="true" /> {keyAccessText(order.noegle)}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Status vises, men kan ikke klikkes - se noten over
                  komponenten. Skiftet sker i montørens flow. */}
              <StatusBadge status={order.status} />
              {order.status === "afsluttet" && onReopenOrder && canFieldwork && (
                <button onClick={onReopenOrder} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1.5 flex items-center gap-1" title="Sagen var ikke færdig alligevel">
                  <RotateCw size={13} aria-hidden="true" /> Genåbn sag
                </button>
              )}
              {(canPlan || canEditCustomer) && (
                <button onClick={() => setPanel("booking")} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1.5 flex items-center gap-1"><Pencil size={13} aria-hidden="true" /> Redigér booking</button>
              )}
              {onSetLineItems && canFieldwork && (
                <button onClick={() => setPanel("varelinjer")} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1.5 flex items-center gap-1"><Pencil size={13} aria-hidden="true" /> Redigér varelinjer</button>
              )}
              {onDuplicate && canCreate && (
                <button onClick={() => setPanel("dupliker")} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1.5 flex items-center gap-1"><Copy size={13} aria-hidden="true" /> Dupliker / opfølgning</button>
              )}
              {onDeleteOrder && canDelete && (
                <button onClick={() => setPanel("slet")} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger rounded px-1 py-1.5 flex items-center gap-1"><Trash2 size={13} aria-hidden="true" /> Slet sag</button>
              )}
            </div>
          </div>
        </div>
      )}

      <LineItemDetails order={order} onToggleAddOn={canFieldwork ? onToggleAddOn : undefined} onAddAddOn={canFieldwork ? onAddAddOn : undefined} onRemoveAddOn={canFieldwork ? onRemoveAddOn : undefined} />
      <div className="flex border-b border-line mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-brand ${tab === t.key ? "text-ink border-b-2 border-brand" : "text-muted hover:text-ink"}`}>
            {t.label} <span className="font-mono text-xs">({t.count})</span>
          </button>
        ))}
      </div>
      {tab === "noter" && <Notes order={order} onAdd={canFieldwork ? addNote : undefined} />}
      {tab === "materialer" && (
        (order.materialer || []).length === 0 ? (
          <p className="text-sm text-muted italic">Intet ekstra materialeforbrug registreret for denne sag.</p>
        ) : (
          <div className="space-y-2">
            {[...order.materialer].reverse().map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border-l-2 border-brand bg-white border border-line px-3 py-2 shadow-sm">
                <p className="text-sm text-ink">{m.antal > 1 ? `${m.antal}× ` : ""}{m.navn}</p>
                <p className="font-mono text-[11px] text-muted shrink-0">{m.tid}</p>
              </div>
            ))}
          </div>
        )
      )}
      {tab === "billeder" && <Photos order={order} onAdd={canFieldwork ? addPhoto : undefined} />}
      {tab === "rapporter" && <Reports order={order} onAdd={canFieldwork ? addReport : undefined} />}
      {tab === "tid" && <TimeLog order={order} />}
    </div>
  );
}

export { OrderView, BookingEditor, DuplicatePanel, LineItemEditor, DeleteOrderPanel };
