// Egenskaber ved butikkens PRIMÆRE YDELSER (oktober 2026). Ren logik uden
// afhængigheder (tests/ydelser.test.mjs).
//
// STANDARDYDELSE: den ydelse, en ny varelinje starter på (trin 3 i bookingen).
// Butikkens admin vælger den under Admin -> Varer & ydelser -> Primære ydelser
// (feltet `standard` på ydelsen). Er ingen valgt, bruges "Montering", og findes den
// ikke, den første på listen - så en ny butik får et fornuftigt udgangspunkt uden at
// have sat noget op. Sælgeren kan altid skifte ydelse på den enkelte linje.
//
// OPGAVEBESKRIVELSE: nogle ydelser (typisk en servicetur) kan ikke forstås ud fra
// varetype alene - montøren skal vide, HVAD der skal gøres. Feltet
// `kraeverBeskrivelse` på ydelsen slår et fritekstfelt til på varelinjen. Er det
// aldrig sat, regnes en ydelse med "service" i navnet for en servicetur.
//
// PLUKKES PÅ LAGER: ved en servicetur er produktet typisk allerede hos kunden, så linjen hører
// ikke på lagerets plukliste. Feltet `plukkes` på ydelsen afgør det; er det aldrig sat, plukkes
// alt undtagen ydelser med "service" i navnet. Butikkens admin kan ændre det pr. ydelse.

const norm = (s) => (s ?? "").toString().trim().toLowerCase();

export function standardYdelse(ydelser) {
  const liste = Array.isArray(ydelser) ? ydelser.filter(Boolean) : [];
  return liste.find((p) => p.standard === true) || liste.find((p) => norm(p.navn) === "montering") || liste[0];
}

export function kraeverBeskrivelse(ydelse) {
  if (!ydelse) return false;
  if (typeof ydelse.kraeverBeskrivelse === "boolean") return ydelse.kraeverBeskrivelse;
  return norm(ydelse.navn).includes("service");
}

export function skalPlukkes(ydelse) {
  if (!ydelse) return true;
  if (typeof ydelse.plukkes === "boolean") return ydelse.plukkes;
  return !norm(ydelse.navn).includes("service");
}

// Skal denne VARELINJE med på pluklisten? Ydelsen slås op i butikkens liste (så adminens valg
// gælder også for sager, der allerede er oprettet); findes den ikke (fx slettet), bruges den
// kopi af ydelsen, linjen selv bærer.
export function linjeSkalPlukkes(linje, ydelser) {
  const fundet = (Array.isArray(ydelser) ? ydelser : []).find((p) => p && p.id === linje?.primaerYdelse?.id);
  return skalPlukkes(fundet || linje?.primaerYdelse);
}
