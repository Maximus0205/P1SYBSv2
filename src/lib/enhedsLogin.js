// Husker på DENNE enhed, hvem der har slået Face ID/fingeraftryk til, så login kan starte direkte med Face ID uden at skrive noget.
// Der gemmes kun butiksnummer og brugernavn (ingen kode og ingen nøgler). Selve loginet kræver stadig Face ID, og serveren verificerer det.
const NOEGLE = "p1sybs_enhedslogin";

export function laesEnhedsLogin() {
  try {
    const v = JSON.parse(localStorage.getItem(NOEGLE) || "null");
    return v && typeof v.butik === "string" && typeof v.brugernavn === "string" && v.butik && v.brugernavn ? { butik: v.butik, brugernavn: v.brugernavn } : null;
  } catch { return null; }
}
export function gemEnhedsLogin({ butik, brugernavn }) {
  const b = String(butik ?? "").trim(); const u = String(brugernavn ?? "").trim();
  if (!b || !u) return;
  try { localStorage.setItem(NOEGLE, JSON.stringify({ butik: b, brugernavn: u })); } catch { /* privat tilstand el. lign. - ikke kritisk */ }
}
export function sletEnhedsLogin() {
  try { localStorage.removeItem(NOEGLE); } catch { /* ikke kritisk */ }
}
