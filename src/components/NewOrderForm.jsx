import React, { useState } from "react";
import { Plus, Building2, Clock, Hash, ChevronLeft, ChevronRight, Check, KeyRound, AlertTriangle } from "lucide-react";
import { TIME_SLOTS, buildTitle, formatDuration, createLineItem, lineItemMinutes, timeSlotById, timeSlotText, todayISO, emptyKeyAccess, keyAccessText } from "../data/domain";
import { CASE_TYPES, SAGSTYPE_KUNDE, SAGSTYPE_TOMGANG, tomgangWarnings, TOMGANG_COLOR } from "../data/caseTypes";
import { ReceiptUpload } from "../components/ReceiptUpload";
import { LineItemEditor, KeyAccessFields, CustomerHistory, SuggestedDates, InteractiveWeekPicker } from "../components/OrderFormFields";
import { AddressInput } from "../components/AddressInput";

// Bookingflowet er delt op i 4 mindre "kort" (trin) i stedet for én lang
// formular:
//  1. Kunde       - KUN kundeinfo (navn/telefon/e-mail) + ordrenummer.
//  2. Levering     - adresse, leveringsnote og nøgle/adgang samlet, da det
//                    hele handler om "hvordan/hvor kommer vi ind".
//  3. Varer        - varelinjer & ydelser, inkl. modelnummer-tjek.
//  4. Tidspunkt    - bevidst SIDST: kræver mest kontekst (adresse, varer,
//                    nøgle), viser forslag + interaktiv ugevisning.
//
// SAGSTYPE (september 2026) vælges ALLERFØRST, før alt andet. Det er ikke
// et felt blandt de øvrige, men en forudsætning: valget ændrer, hvad
// resten af formularen spørger om. Ved TOMGANG er der ingen kunde til
// stede på adressen, og nøglen går fra at være en detalje til at være
// forudsætningen for, at montøren overhovedet kan komme ind - se
// data/caseTypes.js.
const STEPS = [
  { key: "kunde", label: "Kunde" },
  { key: "levering", label: "Levering" },
  { key: "varer", label: "Varer & ydelser" },
  { key: "tid", label: "Tidspunkt & montør" },
];

function StepProgress({ step }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Trin {step + 1} af {STEPS.length}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">{STEPS[step].label}</p>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-brand transition-all duration-300 rounded-full" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
    </div>
  );
}

// Typevælgeren står øverst i trin 1 og er to store, tydelige valg frem for
// en dropdown: det er et valg, der ændrer resten af formularen, og det
// skal derfor være synligt HVAD man har valgt hele vejen igennem - ikke
// gemt bag et sammenklappet felt, man kan have overset.
function CaseTypePicker({ value, onChange }) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Hvad er det for en kørsel?</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {CASE_TYPES.map((t) => {
          const valgt = value === t.id;
          const farve = t.id === SAGSTYPE_TOMGANG ? TOMGANG_COLOR : "#E2621B";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-pressed={valgt}
              className="rounded-xl border-2 p-3 text-left transition-colors bg-white hover:bg-panel focus:outline-none focus:ring-2 focus:ring-brand"
              style={{ borderColor: valgt ? farve : "#ECECEC" }}
            >
              <p className="text-sm font-semibold" style={{ color: valgt ? farve : "#1A1A1A" }}>{t.label}</p>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">{t.beskrivelse}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewOrderForm({ technicians, productTypes, productCategories, primaryServices, addOnServices, orders, selectedDate, onAdd, onClose, onOpen, storeFocus }) {
  const [step, setStep] = useState(0);
  const [caseTypeId, setCaseTypeId] = useState(SAGSTYPE_KUNDE);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [hasBuyer, setHasBuyer] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [address, setAddress] = useState("");
  const [addressStatus, setAddressStatus] = useState("tom");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [keyAccess, setKeyAccess] = useState(emptyKeyAccess());
  const [date, setDate] = useState(selectedDate || todayISO());
  const [timeSlotId, setTimeSlotId] = useState("heldag");
  const [technicianId, setTechnicianId] = useState("");
  const [lineItems, setLineItems] = useState([createLineItem(productTypes, primaryServices)]);
  const [saving, setSaving] = useState(false);
  const [attemptedNext, setAttemptedNext] = useState(false);

  const erTomgang = caseTypeId === SAGSTYPE_TOMGANG;
  const titlePreview = buildTitle(lineItems);
  const expectedMinutes = lineItems.reduce((sum, l) => sum + lineItemMinutes(l), 0);

  // Skifter man TIL tomgang, slås nøgle/adgang til med det samme. Det er
  // ikke en antagelse om, at nøglen er på plads - det er at åbne felterne,
  // så man bliver mødt af dem frem for selv at skulle finde på at klikke
  // et flueben, der i denne sagstype altid skal være sat.
  const changeCaseType = (id) => {
    setCaseTypeId(id);
    if (id === SAGSTYPE_TOMGANG && !keyAccess.kraeves) {
      setKeyAccess((prev) => ({ ...prev, kraeves: true }));
    }
  };

  const updateLineItem = (idx, next) => setLineItems((prev) => prev.map((l, i) => (i === idx ? next : l)));
  const removeLineItem = (idx) => setLineItems((prev) => prev.filter((_, i) => i !== idx));
  const addLineItem = () => setLineItems((prev) => [...prev, createLineItem(productTypes, primaryServices)]);

  const fillFromPdf = (fields) => {
    if (fields.navn) setCustomerName(fields.navn);
    if (fields.telefon) setPhone(fields.telefon);
    if (fields.email) setEmail(fields.email);
    if (fields.adresse) setAddress(fields.adresse);
    if (fields.varetyper?.length) {
      setLineItems(fields.varetyper.map((navn) => {
        const vt = productTypes.find((v) => v.navn === navn);
        return createLineItem(productTypes, primaryServices, vt ? vt.id : undefined, vt ? "" : navn);
      }));
    }
  };

  // Kun kunde-trinnet (navn) er reelt påkrævet for at bladre videre - dato
  // har allerede en fornuftig standardværdi, så den blokerer ikke fremad.
  // Ved tomgang er "navnet" rekvirenten (udlejer/administrator), og det er
  // stadig påkrævet: nogen har bestilt arbejdet, og den nogen skal kunne
  // kontaktes, hvis noget går galt i et tomt lejemål.
  const stepValid = [!!customerName.trim(), true, true, true];
  const canProceed = stepValid[step];

  const goNext = () => {
    if (!canProceed) { setAttemptedNext(true); return; }
    setAttemptedNext(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => { setAttemptedNext(false); setStep((s) => Math.max(s - 1, 0)); };

  const applySuggestion = (suggestedDate, suggestedTechnicianId) => {
    if (suggestedDate) setDate(suggestedDate);
    if (suggestedTechnicianId) setTechnicianId(suggestedTechnicianId);
  };

  const jobSummary = {
    titel: titlePreview,
    adresse: address || "(ikke udfyldt endnu)",
    forventetVarighed: formatDuration(expectedMinutes),
    noegle: keyAccess.kraeves ? keyAccessText(keyAccess) : undefined,
  };

  // Bløde advarsler, ikke spærringer - se tomgangWarnings i caseTypes.js.
  const advarsler = tomgangWarnings({ sagstype: caseTypeId, noegle: keyAccess });

  const submit = async () => {
    if (!customerName.trim() || !date) return;
    const t = timeSlotById(timeSlotId);
    setSaving(true);
    await onAdd({
      sagstype: caseTypeId,
      kunde: { navn: customerName.trim(), telefon: phone.trim(), email: email.trim(), adresse: address.trim(), leveringsnote: deliveryNote.trim() },
      koeber: hasBuyer ? { navn: buyerName.trim(), telefon: buyerPhone.trim(), email: buyerEmail.trim(), adresse: buyerAddress.trim() } : null,
      noegle: keyAccess,
      dato: date, tidsrumId: timeSlotId, start: t.start, slut: t.slut,
      montorId: technicianId || null,
      varelinjer: lineItems,
      ordrenummer: externalReference.trim(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display text-xl uppercase tracking-wide text-ink">
          {erTomgang ? "Book tomgangskørsel" : "Book ny sag"}
        </h3>
        <button onClick={onClose} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1">Annuller</button>
      </div>
      <StepProgress step={step} />

      {step === 0 && (
        <div>
          <CaseTypePicker value={caseTypeId} onChange={changeCaseType} />

          {!erTomgang && <ReceiptUpload productTypes={productTypes} onFill={fillFromPdf} />}

          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            {erTomgang ? "Rekvirent (hvem har bestilt arbejdet)" : "Kunde"}
          </h4>
          {erTomgang && (
            <p className="text-[11px] text-muted mb-2">
              Der er ingen på adressen. Kontaktoplysningerne bruges til at afklare sagen — ikke til at varsle ankomst.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 mb-3">
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={erTomgang ? "Udlejer/administrator" : "Kundenavn"} aria-label={erTomgang ? "Rekvirent" : "Kundenavn"} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" aria-label="Telefon" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail (valgfri)" aria-label="E-mail" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
            <div className="relative">
              <Hash size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} placeholder="Ordre-/fakturanummer (valgfrit)" aria-label="Ordre- eller fakturanummer" className="w-full rounded-lg border border-line bg-panel pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
            </div>
          </div>

          <CustomerHistory phone={phone} name={customerName} orders={orders} onOpen={onOpen} />

          {!erTomgang && (
            <>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input type="checkbox" checked={hasBuyer} onChange={(e) => setHasBuyer(e.target.checked)} className="w-5 h-5 accent-ink" />
                <Building2 size={14} className="text-muted" aria-hidden="true" />
                <span className="text-sm text-ink">Køber er en anden end kunden (fx en udlejningsvirksomhed)</span>
              </label>
              {hasBuyer && (
                <div className="grid gap-3 sm:grid-cols-2 pl-1">
                  <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Købers navn/virksomhed" aria-label="Købers navn" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
                  <input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="Købers telefon" aria-label="Købers telefon" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
                  <input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="Købers e-mail" aria-label="Købers e-mail" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
                  <input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="Købers adresse (fakturering)" aria-label="Købers adresse" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
                </div>
              )}
            </>
          )}
          {attemptedNext && !stepValid[0] && (
            <p className="text-xs text-danger mt-3">{erTomgang ? "Rekvirentens navn" : "Kundenavn"} skal udfyldes, før du kan gå videre.</p>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            {erTomgang ? "Lejemålets adresse" : "Leveringsadresse"}
          </h4>
          <div className="grid gap-3 mb-4">
            <AddressInput value={address} onChange={setAddress} placeholder={erTomgang ? "Lejemålets adresse" : "Leveringsadresse"} onValidationChange={setAddressStatus} focus={storeFocus} />
            <input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder={erTomgang ? "Note, fx 'Opgang B, 3. sal th'" : "Leveringsnote, fx 'Ring før ankomst'"} aria-label="Note" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
          </div>
          {addressStatus === "usikker" && (
            <p className="text-xs text-danger mb-4">Bemærk: adressen kunne ikke bekræftes af korttjenesten — dobbelttjek den.</p>
          )}

          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
            <KeyRound size={13} className="shrink-0" style={{ color: erTomgang ? TOMGANG_COLOR : undefined }} aria-hidden="true" />
            Nøgle & adgang
            {erTomgang && <span className="normal-case font-normal text-[11px] text-muted">— påkrævet ved tomgang</span>}
          </h4>
          {erTomgang && (
            <p className="text-[11px] text-muted mb-2">
              Montøren skal kunne lukke sig ind selv. Skriv præcist hvor nøglen findes, og hvad der skal til for at komme ind (kode, alarm, opgang).
            </p>
          )}
          <KeyAccessFields keyAccess={keyAccess} onChange={setKeyAccess} />

          {advarsler.length > 0 && (
            <div className="mt-3 rounded-lg border border-danger bg-danger/10 p-3">
              {advarsler.map((a) => (
                <p key={a} className="text-xs text-danger flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" /> {a}
                </p>
              ))}
              <p className="text-[11px] text-muted mt-1.5">Du kan godt booke alligevel — men montøren kører forgæves, hvis det ikke er på plads inden.</p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-4 px-3 py-2 rounded-xl bg-panel border border-line flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Overskrift (dannes automatisk)</p>
              <p className="text-sm font-semibold text-ink">{titlePreview}</p>
            </div>
            <div className="flex items-center gap-1.5 text-muted">
              <Clock size={14} aria-hidden="true" />
              <span className="text-sm font-semibold text-ink">{formatDuration(expectedMinutes)}</span>
              <span className="text-xs">forventet</span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Varelinjer & ydelser</h4>
            <button onClick={addLineItem} className="text-xs font-semibold uppercase tracking-wide text-ink border border-line rounded-full hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand px-3 py-2 flex items-center gap-1"><Plus size={13} aria-hidden="true" /> Tilføj varelinje</button>
          </div>
          <div className="space-y-2">
            {lineItems.map((l, idx) => (
              <LineItemEditor key={l.id} lineItem={l} productTypes={productTypes} productCategories={productCategories} primaryServices={primaryServices} addOnServices={addOnServices} onChange={(next) => updateLineItem(idx, next)} onRemove={() => removeLineItem(idx)} canRemove={lineItems.length > 1} />
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Tidspunkt & montør</h4>
          <p className="text-xs text-muted mb-3">
            Forslag til "{titlePreview}" {erTomgang ? "på" : "hos"} {address || (erTomgang ? "lejemålet" : "kunden")} herunder — tryk på ét for at bruge det, eller vælg selv i ugevisningen.
          </p>

          <SuggestedDates
            orders={orders}
            technicians={technicians}
            date={date}
            address={address}
            jobSummary={jobSummary}
            onSelectDate={applySuggestion}
          />

          <InteractiveWeekPicker orders={orders} technicians={technicians} date={date} onSelectDate={applySuggestion} />

          <div className="grid gap-3 sm:grid-cols-3 mb-2">
            <label className="text-xs text-muted">
              Dato (kan også vælges ovenfor)
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand" />
            </label>
            <label className="text-xs text-muted">
              Tidsrum
              <select value={timeSlotId} onChange={(e) => setTimeSlotId(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
                {TIME_SLOTS.map((t) => <option key={t.id} value={t.id}>{timeSlotText(t.id)}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">
              Montør/bil
              <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand">
                <option value="">Ikke tildelt endnu</option>
                {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn} — {m.bil}</option>)}
              </select>
            </label>
          </div>

          {erTomgang && advarsler.length > 0 && (
            <p className="text-xs text-danger flex items-start gap-1.5 mt-2">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
              Nøgleoplysningerne mangler stadig — gå tilbage til Levering, hvis de kan skaffes nu.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-divider">
        <button
          onClick={goBack}
          disabled={step === 0}
          className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors disabled:opacity-0 disabled:pointer-events-none flex items-center gap-1"
        >
          <ChevronLeft size={15} aria-hidden="true" /> Tilbage
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={goNext}
            className="px-5 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1"
          >
            Næste <ChevronRight size={15} aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={saving || !date}
            className="px-5 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            <Check size={15} aria-hidden="true" /> {saving ? "Booker..." : erTomgang ? "Book tomgang" : "Book sag"}
          </button>
        )}
      </div>
    </div>
  );
}

export { NewOrderForm };
