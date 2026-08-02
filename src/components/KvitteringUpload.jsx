import React, { useState, useRef } from "react";
import { Upload, AlertCircle } from "lucide-react";

let pdfjsIndlæst = null;

const indlaesPdfJs = () => {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsIndlæst) return pdfjsIndlæst;
  pdfjsIndlæst = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Kunne ikke hente PDF-læser."));
    document.body.appendChild(script);
  });
  return pdfjsIndlæst;
};

const udtraekFraKvitteringstekst = (tekst, varetyper) => {
  const resultat = {};
  const emailMatch = tekst.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) resultat.email = emailMatch[0];
  const telefonMatch = tekst.match(/\b(\d{2}\s?\d{2}\s?\d{2}\s?\d{2})\b/);
  if (telefonMatch) resultat.telefon = telefonMatch[1];
  const adresseMatch = tekst.match(/([A-ZÆØÅ][a-zæøåA-ZÆØÅ.\s]{2,40}\d{1,3}[A-Za-z]?,?\s*\d{4}\s+[A-ZÆØÅ][a-zæøåA-ZÆØÅ]+)/);
  if (adresseMatch) resultat.adresse = adresseMatch[1].trim();
  const navnMatch = tekst.match(/(?:kunde|navn|att\.?)\s*[:\-]\s*([A-ZÆØÅ][\wæøåÆØÅ.\-'\s]{2,40})/i);
  if (navnMatch) resultat.navn = navnMatch[1].trim();
  const fundneVaretyper = varetyper.map((v) => v.navn).filter((navn) => new RegExp(navn.replace(/[/\-]/g, ".?"), "i").test(tekst));
  if (fundneVaretyper.length) resultat.varetyper = fundneVaretyper;
  return resultat;
};

function KvitteringUpload({ varetyper, onUdfyld }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null);

  const handleFile = async (file) => {
    setStatus({ loading: true });
    try {
      const pdfjsLib = await indlaesPdfJs();
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let fuldTekst = "";
      const sider = Math.min(pdf.numPages, 3);
      for (let i = 1; i <= sider; i++) {
        const side = await pdf.getPage(i);
        const indhold = await side.getTextContent();
        fuldTekst += indhold.items.map((it) => it.str).join(" ") + "\n";
      }
      if (!fuldTekst.trim()) {
        setStatus({ loading: false, fejl: "Fandt ingen tekst i PDF'en — er det en scannet/fotograferet kvittering? Så skal felterne udfyldes manuelt." });
        return;
      }
      const felter = udtraekFraKvitteringstekst(fuldTekst, varetyper);
      const fundet = Object.keys(felter);
      if (fundet.length === 0) {
        setStatus({ loading: false, fejl: "Kunne ikke genkende nogen felter automatisk — udfyld venligst manuelt." });
        return;
      }
      onUdfyld(felter);
      setStatus({ loading: false, fundet });
    } catch (e) {
      setStatus({ loading: false, fejl: "Kunne ikke læse PDF'en. Prøv igen eller udfyld manuelt." });
    }
  };

  return (
    <div className="border border-dashed border-[#D8D0BE] hover:border-[#E2621B] transition-colors bg-[#FCFAF4] p-4 mb-4">
      <div onClick={() => inputRef.current?.click()} className="flex items-center gap-3 cursor-pointer">
        <Upload size={18} className="text-[#52697E] shrink-0" />
        <div>
          <p className="text-sm font-semibold text-[#1C232E]">Læs ordreinfo fra PDF-kvittering (forsøg)</p>
          <p className="text-xs text-[#52697E]">Udfylder navn/adresse/telefon/varetype hvis de kan genkendes — tjek altid felterne bagefter.</p>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {status?.loading && <p className="text-xs text-[#52697E] mt-2">Læser PDF...</p>}
      {status?.fejl && <p className="text-xs text-[#B3261E] mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {status.fejl}</p>}
      {status?.fundet && <p className="text-xs text-[#3D7A5C] mt-2">Udfyldte felter automatisk: {status.fundet.join(", ")}. Tjek dem lige inden booking.</p>}
    </div>
  );
}

// ---------------- Sælger: booking-formular ----------------



export { indlaesPdfJs, udtraekFraKvitteringstekst, KvitteringUpload };
