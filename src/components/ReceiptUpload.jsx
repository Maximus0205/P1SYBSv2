import React, { useState, useRef } from "react";
import { Upload, AlertCircle } from "lucide-react";

let pdfjsLoaded = null;

const loadPdfJs = () => {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsLoaded) return pdfjsLoaded;
  pdfjsLoaded = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Kunne ikke hente PDF-læser."));
    document.body.appendChild(script);
  });
  return pdfjsLoaded;
};

const extractFromReceiptText = (text, productTypes) => {
  const result = {};
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) result.email = emailMatch[0];
  const phoneMatch = text.match(/\b(\d{2}\s?\d{2}\s?\d{2}\s?\d{2})\b/);
  if (phoneMatch) result.telefon = phoneMatch[1];
  const addressMatch = text.match(/([A-ZÆØÅ][a-zæøåA-ZÆØÅ.\s]{2,40}\d{1,3}[A-Za-z]?,?\s*\d{4}\s+[A-ZÆØÅ][a-zæøåA-ZÆØÅ]+)/);
  if (addressMatch) result.adresse = addressMatch[1].trim();
  const nameMatch = text.match(/(?:kunde|navn|att\.?)\s*[:\-]\s*([A-ZÆØÅ][\wæøåÆØÅ.\-'\s]{2,40})/i);
  if (nameMatch) result.navn = nameMatch[1].trim();
  const foundProductTypes = productTypes.map((v) => v.navn).filter((navn) => new RegExp(navn.replace(/[/\-]/g, ".?"), "i").test(text));
  if (foundProductTypes.length) result.varetyper = foundProductTypes;
  return result;
};

function ReceiptUpload({ productTypes, onFill }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState(null);

  const handleFile = async (file) => {
    setStatus({ loading: true });
    try {
      const pdfjsLib = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let fullText = "";
      const pages = Math.min(pdf.numPages, 3);
      for (let i = 1; i <= pages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((it) => it.str).join(" ") + "\n";
      }
      if (!fullText.trim()) {
        setStatus({ loading: false, fejl: "Fandt ingen tekst i PDF'en — er det en scannet/fotograferet kvittering? Så skal felterne udfyldes manuelt." });
        return;
      }
      const fields = extractFromReceiptText(fullText, productTypes);
      const found = Object.keys(fields);
      if (found.length === 0) {
        setStatus({ loading: false, fejl: "Kunne ikke genkende nogen felter automatisk — udfyld venligst manuelt." });
        return;
      }
      onFill(fields);
      setStatus({ loading: false, fundet: found });
    } catch (e) {
      setStatus({ loading: false, fejl: "Kunne ikke læse PDF'en. Prøv igen eller udfyld manuelt." });
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-line hover:border-brand transition-colors bg-panel p-4 mb-4">
      <div onClick={() => inputRef.current?.click()} className="flex items-center gap-3 cursor-pointer">
        <Upload size={18} className="text-muted shrink-0" />
        <div>
          <p className="text-sm font-semibold text-ink">Læs ordreinfo fra PDF-kvittering (forsøg)</p>
          <p className="text-xs text-muted">Udfylder navn/adresse/telefon/varetype hvis de kan genkendes — tjek altid felterne bagefter.</p>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
      {status?.loading && <p className="text-xs text-muted mt-2">Læser PDF...</p>}
      {status?.fejl && <p className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} /> {status.fejl}</p>}
      {status?.fundet && <p className="text-xs text-success mt-2">Udfyldte felter automatisk: {status.fundet.join(", ")}. Tjek dem lige inden booking.</p>}
    </div>
  );
}

export { loadPdfJs, extractFromReceiptText, ReceiptUpload };
