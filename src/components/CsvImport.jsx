import React, { useState, useRef } from "react";
import Papa from "papaparse";
import { OTHER_PRODUCT_TYPE_ID, createLineItem, createAddOn, timeSlotById, todayISO, uid } from "../data/domain";

function CsvImport({ technicians, productTypes, primaryServices, onImport, onClose }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null);

  const norm = (s) => (s || "").toString().trim().toLowerCase();
  const pick = (row, keys) => {
    for (const k of Object.keys(row)) if (keys.includes(norm(k))) return (row[k] || "").toString().trim();
    return "";
  };
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

  const handleFile = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data;
          const newOrders = rows
            .map((row, i) => {
              const technicianName = norm(pick(row, ["montor", "montør", "bil", "installatoer"]));
              const matchedTechnician = technicians.find((m) => norm(m.navn) === technicianName || norm(m.bil).includes(technicianName));
              const rawProductType = pick(row, ["varetype", "produkttype", "vare"]);
              const matchedProductType = productTypes.find((v) => norm(v.navn) === norm(rawProductType));
              const timeSlotId = matchTimeSlot(pick(row, ["tidsrum", "tid", "periode"]));
              const t = timeSlotById(timeSlotId);
              const date = matchDate(pick(row, ["dato", "date"]));
              const lineItem = createLineItem(productTypes, primaryServices, matchedProductType ? matchedProductType.id : OTHER_PRODUCT_TYPE_ID, matchedProductType ? "" : rawProductType);
              const rawAddOns = pick(row, ["ydelser", "opgaver", "opmærksomhedspunkter"]);
              if (rawAddOns) lineItem.tillaeg = [...lineItem.tillaeg, ...rawAddOns.split(/[;,]/).map((y) => y.trim()).filter(Boolean).map((navn) => createAddOn(navn))];
              const buyerName = pick(row, ["køber", "koeber", "buyer"]);
              return {
                id: uid(),
                nr: pick(row, ["sagsnr", "nr", "sag", "sagsnummer"]) || `IMP-${i + 1}`,
                kunde: {
                  navn: pick(row, ["kunde", "kundenavn"]) || "Uden navn",
                  telefon: pick(row, ["telefon", "tlf"]),
                  email: pick(row, ["email", "e-mail"]),
                  adresse: pick(row, ["adresse"]),
                  leveringsnote: pick(row, ["leveringsnote", "note"]),
                },
                koeber: buyerName ? { navn: buyerName, telefon: pick(row, ["købertelefon", "koebertelefon"]), email: pick(row, ["købermail", "koebermail"]), adresse: pick(row, ["køberadresse", "koeberadresse"]) } : null,
                noegle: { kraeves: /ja|true|1/i.test(pick(row, ["nøgle", "noegle"])), type: pick(row, ["nøgletype", "noegletype"]), detaljer: pick(row, ["nøgledetaljer", "noegledetaljer"]), placering: pick(row, ["nøgleplacering", "noegleplacering"]) },
                dato: date, tidsrumId: timeSlotId, start: t.start, slut: t.slut,
                montorId: matchedTechnician ? matchedTechnician.id : null,
                status: "planlagt",
                plukket: false,
                varelinjer: [lineItem],
                noter: [], billeder: [], rapporter: [],
                stemplerInd: null, logs: [],
              };
            })
            .filter((s) => s.kunde.navn !== "Uden navn" || s.kunde.adresse);
          onImport(newOrders);
          setStatus({ count: newOrders.length, error: null });
        } catch (e) {
          setStatus({ count: 0, error: "Kunne ikke læse filen." });
        }
      },
      error: (err) => setStatus({ count: 0, error: err.message }),
    });
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <h3 className="font-display text-xl uppercase tracking-wide text-ink mb-2">Importér sager fra CSV</h3>
      <p className="text-sm text-muted mb-4">
        Forventede kolonner: <strong>Sagsnr, Kunde, Telefon, Email, Adresse, Leveringsnote, Køber, Nøgle, Nøgletype, Nøgleplacering, Dato, Tidsrum, Montør, Varetype, Ydelser</strong>. Hver række giver én varelinje. Mangler en kolonne, springes den over.
      </p>
      <div onClick={() => inputRef.current?.click()} className="rounded-xl border border-dashed border-line hover:border-brand transition-colors p-6 text-center cursor-pointer bg-panel">
        <p className="text-sm text-muted">Tryk for at vælge CSV-fil</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {status && (
        <p className={`text-sm mt-3 ${status.error ? "text-danger" : "text-success"}`}>
          {status.error ? status.error : `${status.count} sager importeret.`}
        </p>
      )}
      <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted transition-colors mt-4">
        Luk
      </button>
    </div>
  );
}

export { CsvImport };
