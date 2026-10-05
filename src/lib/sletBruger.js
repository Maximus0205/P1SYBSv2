// BEKRÆFTELSESFLOW VED SLETNING AF EN BRUGER (oktober 2026). Ren logik uden afhængigheder (tests/sletBruger.test.mjs).
//
// Deles af Admin (hooks/useUsers.js) og Systemadmin (pages/SystemAdminPage.jsx), så de to steder aldrig igen kommer til
// at opføre sig forskelligt - systemadmin kunne før slet ikke slette brugere herfra, selv om Edge Functionen
// admin-slet-bruger altid har tilladt det.
//
// Flowet: (1) hent konsekvenserne UDEN at slette (tjekKun), (2) vis dem og bed om bekræftelse, (3) slet. Rettighedstjekket
// og de to spærringer - man kan ikke slette sig selv, og man kan ikke slette butikkens sidste admin - ligger i Edge
// Functionen, ikke her. UI'et er ikke sikkerhedsgrænsen.

export function bekraeftelsesTekst(k = {}) {
  const linjer = [
    `Slet ${k.navn || "brugeren"} permanent?`,
    "",
    "Loginet og profilen slettes og kan ikke gendannes.",
  ];
  if (k.fravaersperioder > 0) {
    linjer.push(`· ${k.fravaersperioder} ${k.fravaersperioder === 1 ? "registreret fravær/sygemelding slettes" : "registrerede fravær/sygemeldinger slettes"} med.`);
  }
  if (k.kommendeSager > 0) {
    linjer.push(`· ${k.kommendeSager} ${k.kommendeSager === 1 ? "kommende sag er" : "kommende sager er"} tildelt personen. ${k.kommendeSager === 1 ? "Den" : "De"} slettes IKKE, men skal tildeles en anden montør - se Planlægning under "Sygemelding / feriefridag".`);
  }
  return linjer.join("\n");
}

// slet(id, { tjekKun }) er deleteUserAsAdmin; bekraeft(tekst) og advar(tekst) er fx window.confirm/window.alert.
// Svarer { ok:true, konsekvenser? } | { ok:false, annulleret:true } | { ok:false, fejl }.
export async function sletBruger(id, { slet, bekraeft, advar }) {
  const tjek = await slet(id, { tjekKun: true });
  if (!tjek.ok) {
    advar(tjek.fejl || "Kunne ikke slette brugeren.");
    return { ok: false, fejl: tjek.fejl };
  }
  if (!bekraeft(bekraeftelsesTekst(tjek.konsekvenser || {}))) return { ok: false, annulleret: true };

  const resultat = await slet(id);
  if (!resultat.ok) {
    advar(resultat.fejl || "Kunne ikke slette brugeren.");
    return resultat;
  }
  return resultat;
}
