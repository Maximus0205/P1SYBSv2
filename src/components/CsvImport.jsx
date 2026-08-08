import React, { useState, useRef } from "react";
import Papa from "papaparse";
import { ANDET_VARETYPE_ID, lavVarelinje, lavYdelse, tidsrumFraId, todayISO, uid } from "../data/appData";

function CsvImport({ montorer, varetyper, primaerydelser, onImport, onClose }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null);

  const norm = (s) => (s || "").toString().trim().toLowerCase();
  const pick = (row, keys) => {
    for (const k of Object.keys(row)) if (keys.includes(norm(k))) return (row[k] || "").toString().trim();
    return "";
  };
  const matchTidsrum = (raw) => {
    const n = norm(raw);
    if (n.includes("form")) return "formiddag";
    if (n.includes("efter")) return "eftermiddag";
    return "heldag";
  };
  const matchDato = (raw) => {
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
          const nySager = rows
            .map((row, i) => {
              const montorNavn = norm(pick(row, ["montor", "montør", "bil", "installatoer"]));
              const matchedMontor = montorer.find((m) => norm(m.navn) === montorNavn || norm(m.bil).includes(montorNavn));
              const varetypeRaa = pick(row, ["varetype", "produkttype", "vare"]);
              const matchedVaretype = varetyper.find((v) => norm(v.navn) === norm(varetypeRaa));
              const tidsrumId = matchTidsrum(pick(row, ["tidsrum", "tid", "periode"]));
              const t = tidsrumFraId(tidsrumId);
              const dato = matchDato(pick(row, ["dato", "date"]));
              const linje = lavVarelinje(varetyper, primaerydelser, matchedVaretype ? matchedVaretype.id : ANDET_VARETYPE_ID, matchedVaretype ? "" : varetypeRaa);
              const ydelserRaa = pick(row, ["ydelser", "opgaver", "opmærksomhedspunkter"]);
              if (ydelserRaa) linje.tillaeg = [...linje.tillaeg, ...ydelserRaa.split(/[;,]/).map((y) => y.trim()).filter(Boolean).map((navn) => lavYdelse(navn))];
              const koeberNavn = pick(row, ["køber", "koeber", "buyer"]);
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
                koeber: koeberNavn ? { navn: koeberNavn, telefon: pick(row, ["købertelefon", "koebertelefon"]), email: pick(row, ["købermail", "koebermail"]), adresse: pick(row, ["køberadresse", "koeberadresse"]) } : null,
                noegle: { kraeves: /ja|true|1/i.test(pick(row, ["nøgle", "noegle"])), type: pick(row, ["nøgletype", "noegletype"]), detaljer: pick(row, ["nøgledetaljer", "noegledetaljer"]), placering: pick(row, ["nøgleplacering", "noegleplacering"]) },
                dato, tidsrumId, start: t.start, slut: t.slut,
                montorId: matchedMontor ? matchedMontor.id : null,
                status: "planlagt",
                plukket: false,
                varelinjer: [linje],
                noter: [], billeder: [], rapporter: [],
                stemplerInd: null, logs: [],
              };
            })
            .filter((s) => s.kunde.navn !== "Uden navn" || s.kunde.adresse);
          onImport(nySager);
          setStatus({ count: nySager.length, error: null });
        } catch (e) {
          setStatus({ count: 0, error: "Kunne ikke læse filen." });
        }
      },
      error: (err) => setStatus({ count: 0, error: err.message }),
    });
  };

  return (
    <div className="border border-[#D8D0BE] bg-white p-5">
      <h3 className="font-['Barlow_Condensed'] text-xl uppercase tracking-wide text-[#1C232E] mb-2">Importér sager fra CSV</h3>
      <p className="text-sm text-[#52697E] mb-4">
        Forventede kolonner: <strong>Sagsnr, Kunde, Telefon, Email, Adresse, Leveringsnote, Køber, Nøgle, Nøgletype, Nøgleplacering, Dato, Tidsrum, Montør, Varetype, Ydelser</strong>. Hver række giver én varelinje. Mangler en kolonne, springes den over.
      </p>
      <div onClick={() => inputRef.current?.click()} className="border border-dashed border-[#D8D0BE] hover:border-[#E2621B] transition-colors p-6 text-center cursor-pointer bg-[#F3EFE6]">
        <p className="text-sm text-[#52697E]">Tryk for at vælge CSV-fil</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {status && (
        <p className="text-sm mt-3" style={{ color: status.error ? "#B3261E" : "#3D7A5C" }}>
          {status.error ? status.error : `${status.count} sager importeret.`}
        </p>
      )}
      <button onClick={onClose} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-[#52697E] border border-[#D8D0BE] hover:border-[#52697E] transition-colors mt-4">
        Luk
      </button>
    </div>
  );
}

// ---------------- Fælles: kompakt sagskort ----------------



export { CsvImport };
