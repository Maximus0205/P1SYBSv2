import React, { useState } from "react";
import { Plus, Building2, Clock, Hash } from "lucide-react";
import { TIME_SLOTS, buildTitle, formatDuration, createLineItem, lineItemMinutes, timeSlotById, timeSlotText, todayISO, emptyKeyAccess } from "../data/domain";
import { ReceiptUpload } from "../components/ReceiptUpload";
import { LineItemEditor, KeyAccessFields, AddressSuggestion, DailyRouteOverview } from "../components/OrderFormFields";
import { DistanceSuggestions } from "../components/DistanceSuggestions";
import { AddressInput } from "../components/AddressInput";

function NewOrderForm({ technicians, productTypes, productCategories, primaryServices, addOnServices, orders, selectedDate, onAdd, onClose, storeFocus }) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [addressStatus, setAddressStatus] = useState("tom");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [hasBuyer, setHasBuyer] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [keyAccess, setKeyAccess] = useState(emptyKeyAccess());
  const [date, setDate] = useState(selectedDate || todayISO());
  const [timeSlotId, setTimeSlotId] = useState("heldag");
  const [technicianId, setTechnicianId] = useState("");
  const [lineItems, setLineItems] = useState([createLineItem(productTypes, primaryServices)]);
  const [saving, setSaving] = useState(false);

  const titlePreview = buildTitle(lineItems);
  const expectedMinutes = lineItems.reduce((sum, l) => sum + lineItemMinutes(l), 0);

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

  return (
    <div className="border border-[#D8D0BE] bg-white p-5">
      <h3 className="font-['Barlow_Condensed'] text-xl uppercase tracking-wide text-[#1C232E] mb-4">Book ny sag</h3>

      <ReceiptUpload productTypes={productTypes} onFill={fillFromPdf} />

      <div className="mb-4 px-3 py-2 bg-[#F3EFE6] border border-[#D8D0BE] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#52697E]">Overskrift (dannes automatisk)</p>
          <p className="text-sm font-semibold text-[#1C232E]">{titlePreview}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[#52697E]">
          <Clock size={14} />
          <span className="text-sm font-semibold text-[#1C232E]">{formatDuration(expectedMinutes)}</span>
          <span className="text-xs">forventet</span>
        </div>
      </div>

      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52697E] mb-2">Kunde (modtager af levering)</h4>
      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Kundenavn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail (valgfri)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <AddressInput value={address} onChange={setAddress} placeholder="Leveringsadresse" onValidationChange={setAddressStatus} focus={storeFocus} />
        <div className="relative sm:col-span-2">
          <Hash size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
          <input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} placeholder="Ordre-/fakturanummer (valgfrit, til sporbarhed)" className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        </div>
        <input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="Leveringsnote, fx 'Ring før ankomst'" className="sm:col-span-2 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
      </div>

      <AddressSuggestion address={address} date={date} orders={orders} onUseDate={(d) => setDate(d)} />
      <DistanceSuggestions address={address} date={date} orders={orders} onUseDate={(d) => setDate(d)} />

      <label className="flex items-center gap-2 cursor-pointer mb-3">
        <input type="checkbox" checked={hasBuyer} onChange={(e) => setHasBuyer(e.target.checked)} className="w-4 h-4 accent-[#1C232E]" />
        <Building2 size={14} className="text-[#52697E]" />
        <span className="text-sm text-[#1C232E]">Køber er en anden end kunden (fx en udlejningsvirksomhed)</span>
      </label>
      {hasBuyer && (
        <div className="grid gap-3 sm:grid-cols-2 mb-4 pl-1">
          <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Købers navn/virksomhed" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="Købers telefon" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="Købers e-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="Købers adresse (fakturering)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        </div>
      )}

      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52697E] mb-2">Nøgle & adgang</h4>
      <div className="mb-4"><KeyAccessFields keyAccess={keyAccess} onChange={setKeyAccess} /></div>

      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52697E] mb-2">Tidspunkt & montør</h4>
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <label className="text-xs text-[#52697E]">
          Dato
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        </label>
        <label className="text-xs text-[#52697E]">
          Tidsrum
          <select value={timeSlotId} onChange={(e) => setTimeSlotId(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            {TIME_SLOTS.map((t) => <option key={t.id} value={t.id}>{timeSlotText(t.id)}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#52697E]">
          Montør/bil
          <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            <option value="">Ikke tildelt endnu</option>
            {technicians.map((m) => <option key={m.id} value={m.id}>{m.navn} — {m.bil}</option>)}
          </select>
        </label>
      </div>

      <DailyRouteOverview orders={orders} technicians={technicians} date={date} />

      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52697E]">Varelinjer & ydelser</h4>
        <button onClick={addLineItem} className="text-xs font-semibold uppercase tracking-wide text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B] px-2 py-1 flex items-center gap-1"><Plus size={13} /> Tilføj varelinje</button>
      </div>
      <div className="space-y-2 mb-4">
        {lineItems.map((l, idx) => (
          <LineItemEditor key={l.id} lineItem={l} productTypes={productTypes} productCategories={productCategories} primaryServices={primaryServices} addOnServices={addOnServices} onChange={(next) => updateLineItem(idx, next)} onRemove={() => removeLineItem(idx)} canRemove={lineItems.length > 1} />
        ))}
      </div>

      {addressStatus === "usikker" && (
        <p className="text-xs text-[#B3261E] mb-2">Bemærk: leveringsadressen kunne ikke bekræftes af korttjenesten — dobbelttjek den, inden du booker.</p>
      )}

      <div className="flex gap-2">
        <button
          disabled={saving}
          onClick={async () => {
            if (!customerName.trim() || !date) return;
            const t = timeSlotById(timeSlotId);
            setSaving(true);
            await onAdd({
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
          }}
          className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60"
        >
          {saving ? "Booker..." : "Book sag"}
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE] hover:border-[#52697E] transition-colors">
          Annuller
        </button>
      </div>
    </div>
  );
}

export { NewOrderForm };
