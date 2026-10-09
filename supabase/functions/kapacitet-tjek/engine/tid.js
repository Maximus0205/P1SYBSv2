// TID OG TIDSVINDUER (kapacitetsmotoren, oktober 2026). Ren logik uden afhængigheder.
//
// Alle tider er MINUTTER FRA MIDNAT (08:00 = 480). Et "vindue" er { fra, til } i minutter. Personers tilgængelighed er en
// liste af vinduer; en ændring som "møder først kl. 10" er derfor blot et vindue, der trækkes fra.

export function tilMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (mi > 59 || h > 24 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

export function tilHHMM(min) {
  const m = Math.round(Number(min) || 0);
  const h = Math.floor(m / 60);
  const mm = ((m % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// Sorterer og fletter overlappende/sammenstødende vinduer; tomme og ugyldige fjernes.
export function samlVinduer(vinduer) {
  const s = (vinduer || [])
    .filter((w) => w && Number.isFinite(w.fra) && Number.isFinite(w.til) && w.til > w.fra)
    .map((w) => ({ fra: w.fra, til: w.til }))
    .sort((a, b) => a.fra - b.fra);
  const ud = [];
  for (const w of s) {
    const sidste = ud[ud.length - 1];
    if (sidste && w.fra <= sidste.til) sidste.til = Math.max(sidste.til, w.til);
    else ud.push({ ...w });
  }
  return ud;
}

// Trækker et antal "optaget"-vinduer fra en liste vinduer.
export function traekFraVinduer(vinduer, fjern) {
  let ud = samlVinduer(vinduer);
  for (const f of samlVinduer(fjern)) {
    const ny = [];
    for (const w of ud) {
      if (f.til <= w.fra || f.fra >= w.til) { ny.push(w); continue; }
      if (f.fra > w.fra) ny.push({ fra: w.fra, til: f.fra });
      if (f.til < w.til) ny.push({ fra: f.til, til: w.til });
    }
    ud = ny;
  }
  return ud;
}

// Fællestid: de tidsrum, hvor begge lister har et vindue.
export function faellesVinduer(a, b) {
  const x = samlVinduer(a);
  const y = samlVinduer(b);
  const ud = [];
  for (const p of x) {
    for (const q of y) {
      const fra = Math.max(p.fra, q.fra);
      const til = Math.min(p.til, q.til);
      if (til > fra) ud.push({ fra, til });
    }
  }
  return samlVinduer(ud);
}

// Det tidligste tidspunkt >= fra, hvor en aktivitet på `varighed` minutter ligger HELT inden for et vindue.
// null = der er ikke plads i noget vindue.
export function foersteLedigeStart(vinduer, fra, varighed) {
  for (const w of vinduer || []) {
    const s = Math.max(w.fra, fra);
    if (s + varighed <= w.til) return s;
  }
  return null;
}

export const sumVinduer = (vinduer) => (vinduer || []).reduce((sum, w) => sum + Math.max(0, w.til - w.fra), 0);
