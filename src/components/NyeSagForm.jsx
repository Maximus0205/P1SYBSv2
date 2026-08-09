import React, { useState } from "react";
import { Plus, Building2, Clock, Hash } from "lucide-react";
import { TIDSRUM, dannTitel, formatVarighed, lavVarelinje, linjeMinutter, tidsrumFraId, tidsrumTekst, todayISO, tomNoegle } from "../data/appData";
import { KvitteringUpload } from "../components/KvitteringUpload";
import { VarelinjeRedigering, NoegleFelter, AdresseForslag } from "../components/SagFormFields";
import { AfstandsForslag } from "../components/AfstandsForslag";
import { AdresseInput } from "../components/AdresseInput";

function NyeSagForm({ montorer, varetyper, varekategorier, primaerydelser, tillaegsydelser, sager, valgtDato, onAdd, onClose, butikFokus }) {
  const [kundeNavn, setKundeNavn] = useState("");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
  const [adresse, setAdresse] = useState("");
  const [adresseStatus, setAdresseStatus] = useState("tom");
  const [leveringsnote, setLeveringsnote] = useState("");
  const [ordrenummer, setOrdrenummer] = useState("");
  const [harKoeber, setHarKoeber] = useState(false);
  const [koeberNavn, setKoeberNavn] = useState("");
  const [koeberTelefon, setKoeberTelefon] = useState("");
  const [koeberEmail, setKoeberEmail] = useState("");
  const [koeberAdresse, setKoeberAdresse] = useState("");
  const [noegle, setNoegle] = useState(tomNoegle());
  const [dato, setDato] = useState(valgtDato || todayISO());
  const [tidsrumId, setTidsrumId] = useState("heldag");
  const [montorId, setMontorId] = useState("");
  const [varelinjer, setVarelinjer] = useState([lavVarelinje(varetyper, primaerydelser)]);
  const [gemmer, setGemmer] = useState(false);

  const titelPreview = dannTitel(varelinjer);
  const forventetMin = varelinjer.reduce((sum, l) => sum + linjeMinutter(l), 0);

  const opdaterLinje = (idx, ny) => setVarelinjer((prev) => prev.map((l, i) => (i === idx ? ny : l)));
  const fjernLinje = (idx) => setVarelinjer((prev) => prev.filter((_, i) => i !== idx));
  const tilfoejLinje = () => setVarelinjer((prev) => [...prev, lavVarelinje(varetyper, primaerydelser)]);

  const udfyldFraPdf = (felter) => {
    if (felter.navn) setKundeNavn(felter.navn);
    if (felter.telefon) setTelefon(felter.telefon);
    if (felter.email) setEmail(felter.email);
    if (felter.adresse) setAdresse(felter.adresse);
    if (felter.varetyper?.length) {
      setVarelinjer(felter.varetyper.map((navn) => {
        const vt = varetyper.find((v) => v.navn === navn);
        return lavVarelinje(varetyper, primaerydelser, vt ? vt.id : undefined, vt ? "" : navn);
      }));
    }
  };

  return (
    <div className="border border-[#D8D0BE] bg-white p-5">
      <h3 className="font-['Barlow_Condensed'] text-xl uppercase tracking-wide text-[#1C232E] mb-4">Book ny sag</h3>

      <KvitteringUpload varetyper={varetyper} onUdfyld={udfyldFraPdf} />

      <div className="mb-4 px-3 py-2 bg-[#F3EFE6] border border-[#D8D0BE] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#52697E]">Overskrift (dannes automatisk)</p>
          <p className="text-sm font-semibold text-[#1C232E]">{titelPreview}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[#52697E]">
          <Clock size={14} />
          <span className="text-sm font-semibold text-[#1C232E]">{formatVarighed(forventetMin)}</span>
          <span className="text-xs">forventet</span>
        </div>
      </div>

      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52697E] mb-2">Kunde (modtager af levering)</h4>
      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <input value={kundeNavn} onChange={(e) => setKundeNavn(e.target.value)} placeholder="Kundenavn" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefon" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail (valgfri)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        <AdresseInput value={adresse} onChange={setAdresse} placeholder="Leveringsadresse" onValideringChange={setAdresseStatus} fokus={butikFokus} />
        <div className="relative sm:col-span-2">
          <Hash size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52697E]" />
          <input value={ordrenummer} onChange={(e) => setOrdrenummer(e.target.value)} placeholder="Ordre-/fakturanummer (valgfrit, til sporbarhed)" className="w-full border border-[#D8D0BE] bg-[#F3EFE6] pl-8 pr-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        </div>
        <input value={leveringsnote} onChange={(e) => setLeveringsnote(e.target.value)} placeholder="Leveringsnote, fx 'Ring før ankomst'" className="sm:col-span-2 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
      </div>

      <AdresseForslag adresse={adresse} dato={dato} sager={sager} onBrugDato={(d) => setDato(d)} />
      <AfstandsForslag adresse={adresse} dato={dato} sager={sager} onBrugDato={(d) => setDato(d)} />

      <label className="flex items-center gap-2 cursor-pointer mb-3">
        <input type="checkbox" checked={harKoeber} onChange={(e) => setHarKoeber(e.target.checked)} className="w-4 h-4 accent-[#1C232E]" />
        <Building2 size={14} className="text-[#52697E]" />
        <span className="text-sm text-[#1C232E]">Køber er en anden end kunden (fx en udlejningsvirksomhed)</span>
      </label>
      {harKoeber && (
        <div className="grid gap-3 sm:grid-cols-2 mb-4 pl-1">
          <input value={koeberNavn} onChange={(e) => setKoeberNavn(e.target.value)} placeholder="Købers navn/virksomhed" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={koeberTelefon} onChange={(e) => setKoeberTelefon(e.target.value)} placeholder="Købers telefon" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={koeberEmail} onChange={(e) => setKoeberEmail(e.target.value)} placeholder="Købers e-mail" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
          <input value={koeberAdresse} onChange={(e) => setKoeberAdresse(e.target.value)} placeholder="Købers adresse (fakturering)" className="border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]" />
        </div>
      )}

      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52697E] mb-2">Nøgle & adgang</h4>
      <div className="mb-4"><NoegleFelter noegle={noegle} onChange={setNoegle} /></div>

      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52697E] mb-2">Tidspunkt & montør</h4>
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <label className="text-xs text-[#52697E]">
          Dato
          <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] font-mono focus:outline-none focus:border-[#E2621B]" />
        </label>
        <label className="text-xs text-[#52697E]">
          Tidsrum
          <select value={tidsrumId} onChange={(e) => setTidsrumId(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            {TIDSRUM.map((t) => <option key={t.id} value={t.id}>{tidsrumTekst(t.id)}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#52697E]">
          Montør/bil
          <select value={montorId} onChange={(e) => setMontorId(e.target.value)} className="w-full mt-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]">
            <option value="">Ikke tildelt endnu</option>
            {montorer.map((m) => <option key={m.id} value={m.id}>{m.navn} — {m.bil}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#52697E]">Varelinjer & ydelser</h4>
        <button onClick={tilfoejLinje} className="text-xs font-semibold uppercase tracking-wide text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B] px-2 py-1 flex items-center gap-1"><Plus size={13} /> Tilføj varelinje</button>
      </div>
      <div className="space-y-2 mb-4">
        {varelinjer.map((l, idx) => (
          <VarelinjeRedigering key={l.id} linje={l} varetyper={varetyper} varekategorier={varekategorier} primaerydelser={primaerydelser} tillaegsydelser={tillaegsydelser} onChange={(ny) => opdaterLinje(idx, ny)} onFjern={() => fjernLinje(idx)} kanFjerne={varelinjer.length > 1} />
        ))}
      </div>

      {adresseStatus === "usikker" && (
        <p className="text-xs text-[#B3261E] mb-2">Bemærk: leveringsadressen kunne ikke bekræftes af korttjenesten — dobbelttjek den, inden du booker.</p>
      )}

      <div className="flex gap-2">
        <button
          disabled={gemmer}
          onClick={async () => {
            if (!kundeNavn.trim() || !dato) return;
            const t = tidsrumFraId(tidsrumId);
            setGemmer(true);
            await onAdd({
              kunde: { navn: kundeNavn.trim(), telefon: telefon.trim(), email: email.trim(), adresse: adresse.trim(), leveringsnote: leveringsnote.trim() },
              koeber: harKoeber ? { navn: koeberNavn.trim(), telefon: koeberTelefon.trim(), email: koeberEmail.trim(), adresse: koeberAdresse.trim() } : null,
              noegle,
              dato, tidsrumId, start: t.start, slut: t.slut,
              montorId: montorId || null,
              varelinjer,
              ordrenummer: ordrenummer.trim(),
            });
            setGemmer(false);
            onClose();
          }}
          className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors disabled:opacity-60"
        >
          {gemmer ? "Booker..." : "Book sag"}
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE] hover:border-[#52697E] transition-colors">
          Annuller
        </button>
      </div>
    </div>
  );
}



export { NyeSagForm };
