// SAMMENFLETNING AF SAGER VED SAMTIDIGE RETTELSER (oktober 2026)
//
// BAGGRUND: en sag gemmes som ét samlet objekt. Rettede to personer samme
// sag på samme tid, vandt den sidste skrivning og overskrev den førstes
// arbejde uden nogen advarsel. Databasen giver nu hver sag et
// versionsnummer og afviser en skrivning bygget på en forældet udgave
// (se supabase/migrations/20261003_order_versioning.sql).
//
// Denne fil er den RENE logik (ingen afhængigheder, intet netværk), der
// afgør, hvad der så skal ske - så den kan testes uden en database:
//
//   base   = sagen, som DEN SOM REDIGEREDE så den, da vedkommende begyndte
//   mine   = sagen med den lokale ændring
//   theirs = sagen, som den står i databasen NU
//
// Rører vi og de forskellige felter (fx sælgeren flytter datoen, mens
// montøren skriver en note), flettes begge ændringer sammen automatisk.
// Rører vi OG de det samme felt til forskellige værdier, er det en ægte
// konflikt, og INTET gættes - brugeren afgør det (se ConflictBanner.jsx).

// Sagsnummeret ejes af databasen og må aldrig tælle som en ændring.
const IGNORERET = new Set(["nr"]);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true; // null og udefineret er "tomt" begge dele
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

// Hvilke felter på øverste niveau er forskellige mellem to udgaver?
export function changedKeys(from, to) {
  const keys = new Set([...Object.keys(from || {}), ...Object.keys(to || {})]);
  return [...keys].filter((k) => !IGNORERET.has(k) && !deepEqual((from || {})[k], (to || {})[k]));
}

function setKey(obj, k, v) {
  if (v === undefined) delete obj[k];
  else obj[k] = v;
}

// Fletter vores ændringer ind i den nyeste udgave.
//   merged     = theirs + de af vores ændringer, der ikke støder sammen
//   conflicts  = felter begge har ændret til forskellige værdier
//   mineKeys   = ALLE felter vi har ændret i forhold til base
// Er conflicts tom, kan merged gemmes direkte.
export function mergeOrder(base, mine, theirs) {
  const merged = { ...(theirs || {}) };
  const conflicts = [];
  const mineKeys = changedKeys(base, mine);
  const m = mine || {};
  const t = theirs || {};
  for (const k of mineKeys) {
    const theyChanged = !deepEqual((base || {})[k], t[k]);
    if (!theyChanged) setKey(merged, k, m[k]);
    else if (deepEqual(m[k], t[k])) continue; // samme ændring begge steder
    else conflicts.push(k);
  }
  return { merged, conflicts, mineKeys };
}

// Brugeren har valgt "gem min ændring": læg alle vores ændrede felter
// ovenpå den NYESTE udgave. Felter vi ikke rørte, forbliver som andre har
// sat dem - vi overskriver aldrig hele sagen.
export function applyMine(mine, theirs, keys) {
  const out = { ...(theirs || {}) };
  for (const k of keys) setKey(out, k, (mine || {})[k]);
  return out;
}
