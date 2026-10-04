import React, { useState, useRef } from "react";
import Papa from "papaparse";
import { Download } from "lucide-react";
import { OTHER_PRODUCT_TYPE_ID, createLineItem, createAddOn, timeSlotById, todayISO, uid } from "../data/domain";
import { ALIAS, TIDSRUM_VAERDIER, erEksempelraekke, matchBil, norm, pick, skabelonCsv } from "../lib/csvSager";

// BIL, IKKE MONTØR (september 2026): "technicians" er BIL-rækker (se
// App.jsx) - CSV'ens "Montør"-kolonne matches derfor mod en bils navn
// eller nummerplade, og resultatet gemmes som bilId. Kolonnenavnet i
// CSV-skabelonen ("Montør") er bevidst urørt, selvom det nu reelt betyder
// "hvilken bil" - de fleste eksisterende regneark bruger allerede det
// ord, og folk der importerer skal ikke lære et nyt kolonnenavn for
// samme information.
//
// SKABELON (oktober 2026): "Download skabelon" giver en CSV med de rigtige kolonner og
// én eksempelrække, udfyldt med butikkens egen første varetype og bil. Kolonner og
// hjælpere ligger i lib/csvSager.js, så skabelonen og importen deler de samme
// kolonnenavne (testet i tests/csvSager.test.mjs). Eksempelrækken springes over ved
// import, hvis man glemmer at slette den.
function CsvImport({ technicians, productTypes, primaryServices, onImport, onClose }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null);

  const matchTimeSlot = (raw) => {
    const n = norm(raw);
    if (n.includes("form")) return "formiddag";
    if (n.includes("efter")) return "eftermiddag";
    return "heldag";
  };
  const matchDate = (raw) => {
    const s = (raw || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dmy = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return todayISO();
  };

  const hentSkabelon = () => {
    const csv = skabelonCsv({ varetyper: productTypes.map((v) => v.navn), biler: technicians.map((m) => m.navn) });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sager-skabelon.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleFile = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const alle = results.data;
          const rows = alle.filter((row) => !erEksempelraekke(pick(row, ALIAS.kunde)));
          const sprunget = alle.length - rows.length;
          const newOrders = rows
            .map((row, i) => {
              const matchedVehicle = matchBil(technicians, pick(row, ALIAS.bil));
              const rawProductType = pick(row, ALIAS.varetype);
              const matchedProductType = productTypes.find((v) => norm(v.navn) === norm(rawProductType));
              const timeSlotId = matchTimeSlot(pick(row, ALIAS.tidsrum));
              const t = timeSlotById(timeSlotId);
              const date = matchDate(pick(row, ALIAS.dato));
              const lineItem = createLineItem(productTypes, primaryServices, matchedProductType ? matchedProductType.id : OTHER_PRODUCT_TYPE_ID, matchedProductType ? "" : rawProductType);
              const rawAddOns = pick(row, ALIAS.ydelser);
              if (rawAddOns) lineItem.tillaeg = [...lineItem.tillaeg, ...rawAddOns.split(/[;,]/).map((y) => y.trim()).filter(Boolean).map((navn) => createAddOn(navn))];
              const buyerName = pick(row, ALIAS.koeber);
              return {
                id: uid(),
                nr: pick(row, ALIAS.sagsnr) || `IMP-${i + 1}`,
                kunde: {
                  navn: pick(row, ALIAS.kunde) || "Uden navn",
                  telefon: pick(row, ALIAS.telefon),
                  email: pick(row, ALIAS.email),
                  adresse: pick(row, ALIAS.adresse),
                  leveringsnote: pick(row, ALIAS.leveringsnote),
                },
                koeber: buyerName ? { navn: buyerName, telefon: pick(row, ALIAS.koeberTelefon), email: pick(row, ALIAS.koeberMail), adresse: pick(row, ALIAS.koeberAdresse) } : null,
                noegle: { kraeves: /ja|true|1/i.test(pick(row, ALIAS.noegle)), type: pick(row, ALIAS.noegleType), detaljer: pick(row, ALIAS.noegleDetaljer), placering: pick(row, ALIAS.noeglePlacering) },
                dato: date, tidsrumId: timeSlotId, start: t.start, slut: t.slut,
                bilId: matchedVehicle ? matchedVehicle.id : null,
                status: "planlagt",
                plukket: false,
                varelinjer: [lineItem],
                noter: [], billeder: [], rapporter: [],
                stemplerInd: null, logs: [],
              };
            })
            .filter((s) => s.kunde.navn !== "Uden navn" || s.kunde.adresse);
          onImport(newOrders);
          setStatus({ count: newOrders.length, sprunget, error: null });
        } catch (e) {
          setStatus({ count: 0, sprunget: 0, error: "Kunne ikke læse filen." });
        }
      },
      error: (err) => setStatus({ count: 0, sprunget: 0, error: err.message }),
    });
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <h3 className="font-display text-xl uppercase tracking-wide text-ink mb-2">Importér sager fra CSV</h3>
      <p className="text-sm text-muted mb-3">
        Hent skabelonen, udfyld én række pr. sag, og vælg filen herunder. Hver række giver én varelinje. Mangler en kolonne, springes den over.
      </p>
      <button type="button" onClick={hentSkabelon} className="min-h-[44px] px-4 rounded-lg text-sm font-semibold uppercase tracking-wide text-ink border border-ink hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-2 mb-3">
        <Download size={15} aria-hidden="true" /> Download skabelon
      </button>
      <div className="text-xs text-muted mb-4 space-y-1">
        <p>Skabelonen indeholder én eksempelrække ("EKSEMPEL (slet rækken)"), som du kan bruge som forlæg. Den springes over ved import.</p>
        <p><strong>Tidsrum:</strong> {TIDSRUM_VAERDIER.join(", ")}. <strong>Dato:</strong> dd.mm.åååå. <strong>Nøgle:</strong> Ja eller Nej.</p>
        {productTypes.length > 0 && <p><strong>Varetype</strong> (skrives præcis som i kataloget): {productTypes.map((v) => v.navn).join(", ")}. Andet bliver til "Andet" med din tekst.</p>}
        {technicians.length > 0 && <p><strong>Montør</strong> (bilens navn eller nummerplade): {technicians.map((m) => m.navn).join(", ")}. Tom = ikke tildelt.</p>}
        <p><strong>Ydelser:</strong> flere adskilles med komma (fx "Ekstra slange, Bortskaffelse").</p>
      </div>
      <div onClick={() => inputRef.current?.click()} className="rounded-xl border border-dashed border-line hover:border-brand transition-colors p-6 text-center cursor-pointer bg-panel">
        <p className="text-sm text-muted">Tryk for at vælge CSV-fil</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {status && (
        <p className={`text-sm mt-3 ${status.error ? "text-danger" : "text-success"}`} role={status.error ? "alert" : "status"}>
          {status.error ? status.error : `${status.count} sager importeret.${status.sprunget > 0 ? ` Eksempelrækken blev sprunget over.` : ""}`}
        </p>
      )}
      <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted transition-colors mt-4">
        Luk
      </button>
    </div>
  );
}

export { CsvImport };
