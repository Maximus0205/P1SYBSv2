// PAKNING AF LASTERUMMET (kapacitetsmotoren, oktober 2026). Ren logik uden afhængigheder.
//
// Spørgsmålet: kan disse varer fysisk være i bilens kasse, og kan de komme ud igen i stoppenes rækkefølge?
//
// METODE (bevidst enkel og forklarbar, ikke 3D-optimering): gulvet fyldes med rækker på tværs af kassen, fra førerhuset og
// bagud. Varer til de SIDSTE stop placeres først (forrest), så varer til det første stop står nærmest bagdøren. En vare må
// stå oven på en anden, hvis standardviden tillader det, den passer på overfladen, begge vægte er kendte, og den skal af
// SENERE end den, den står på (ellers skulle man løfte den nederste ud først). Højst to i en stak. Varer vippes aldrig.
//
// KONSERVATIV: Siger metoden "passer ikke", kan en omhyggelig stuvning i virkeligheden måske have klaret det. Siger den "passer",
// er det garanteret, at den fundne placering virker. Hver vare får emballagemargin på alle sider.
//
// STANDARDVIDEN om stabling er indbygget (standardStabling) - admin skal ikke definere noget. Et senere trin kan lade udfald
// ("passede/passede ikke") justere den; en vare kan allerede nu få sin egen stabling med i data.

const norm = (s) => String(s || "").toLowerCase();
const pos = (n) => Number.isFinite(n) && n > 0;

export const harMaal = (m) => !!m && pos(Number(m.l)) && pos(Number(m.b)) && pos(Number(m.h));

// kanStaaPaa: må stå oven på noget. kanBaereKg: hvor meget den selv tåler oven på sig.
export function standardStabling(type) {
  const t = norm(type);
  if (/køl|kombiskab|fryse|vinskab|vinkøler|frys/.test(t)) return { kategori: "koel", kanStaaPaa: false, kanBaereKg: 0 };
  if (/opvask/.test(t)) return { kategori: "opvaskemaskine", kanStaaPaa: true, kanBaereKg: 60 };
  if (/tørre|tumbler|tørretumbler/.test(t)) return { kategori: "toerretumbler", kanStaaPaa: true, kanBaereKg: 60 };
  if (/vaske/.test(t)) return { kategori: "vaskemaskine", kanStaaPaa: true, kanBaereKg: 0 };
  if (/ovn|komfur|kogeplade|mikro|emhætte|emhaette|induktion/.test(t)) return { kategori: "hvidevare_let", kanStaaPaa: true, kanBaereKg: 40 };
  return { kategori: "ukendt", kanStaaPaa: false, kanBaereKg: 0 };
}

const fejl = (aarsag, v, besked) => ({ ok: false, aarsag, vareId: v?.id ?? null, besked, placeringer: [] });

// lasterum: { laengdeCm, breddeCm, hoejdeCm } - længde er fra førerhuset og bagud, bredde på tværs, højde indvendigt.
// varer: [{ id, navn, type, stopNr, vaegtKg, maal:{l,b,h}, stabling? }]  (stopNr: lavere = skal af først)
export function pakVarer({ lasterum, varer, emballageMarginCm = 3 }) {
  if (!lasterum || !pos(Number(lasterum.laengdeCm)) || !pos(Number(lasterum.breddeCm)) || !pos(Number(lasterum.hoejdeCm))) {
    return { ok: true, sprunget: true, aarsag: "Lasterum er ikke sat", placeringer: [], gulvPct: 0, ukendte: [] };
  }
  const Lc = Number(lasterum.laengdeCm);
  const Wc = Number(lasterum.breddeCm);
  const Hc = Number(lasterum.hoejdeCm);
  const m = Math.max(0, Number(emballageMarginCm) || 0);

  const ukendte = [];
  const liste = [];
  for (const v of varer || []) {
    if (!harMaal(v.maal)) { ukendte.push(v.id); continue; }
    const vaegt = v.vaegtKg !== null && v.vaegtKg !== undefined && Number.isFinite(Number(v.vaegtKg)) ? Number(v.vaegtKg) : null;
    liste.push({
      id: v.id, navn: v.navn || "", stopNr: Number.isFinite(v.stopNr) ? v.stopNr : 0, vaegt,
      l: Number(v.maal.l) + 2 * m, b: Number(v.maal.b) + 2 * m, h: Number(v.maal.h) + 2 * m,
      st: { ...standardStabling(v.type || v.navn), ...(v.stabling || {}) },
    });
  }

  for (const v of liste) {
    if (!((v.l <= Lc && v.b <= Wc) || (v.b <= Lc && v.l <= Wc))) {
      return { ...fejl("for_stor", v, `${v.navn || v.id} (${Math.round(v.l)}×${Math.round(v.b)} cm inkl. emballage) er for stor til lasterummets gulv (${Lc}×${Wc} cm).`), ukendte, gulvPct: 0 };
    }
    if (v.h > Hc) {
      return { ...fejl("for_hoej", v, `${v.navn || v.id} er ${Math.round(v.h)} cm høj inkl. emballage; lasterummet er ${Hc} cm højt (vares stilles op og vippes ikke).`), ukendte, gulvPct: 0 };
    }
  }

  // Sidste stop forrest; inden for samme stop de største først.
  const sorteret = [...liste].sort((a, b) => b.stopNr - a.stopNr || b.l * b.b - a.l * a.b || String(a.id).localeCompare(String(b.id)));

  const placeringer = [];
  const soejler = []; // { bund, top, x, y, d, w }
  const raekker = []; // { y, dybde, brugt }
  let gulvAreal = 0;

  for (const v of sorteret) {
    // 1) stabling oven på en eksisterende vare
    let staaet = false;
    if (v.st.kanStaaPaa && v.vaegt !== null) {
      for (const s of soejler) {
        const b = s.bund;
        if (s.top || b.vaegt === null) continue;
        if (b.st.kanBaereKg < v.vaegt) continue;
        if (v.stopNr > b.stopNr) continue;
        if (b.h + v.h > Hc) continue;
        if (!((v.l <= s.d && v.b <= s.w) || (v.b <= s.d && v.l <= s.w))) continue;
        s.top = v;
        placeringer.push({ id: v.id, x: s.x, y: s.y, z: b.h, d: s.d, w: s.w, h: v.h, paa: b.id });
        staaet = true;
        break;
      }
    }
    if (staaet) continue;

    // 2) gulvet: først den aktuelle række, ellers en ny række
    const muligheder = [{ d: v.l, w: v.b }, { d: v.b, w: v.l }].filter((o) => o.d <= Lc && o.w <= Wc);
    let rk = raekker[raekker.length - 1];
    let valgt = null;
    if (rk) {
      const rest = Wc - rk.brugt;
      valgt = muligheder
        .filter((o) => o.w <= rest && rk.y + Math.max(rk.dybde, o.d) <= Lc)
        .sort((a, b) => Math.max(rk.dybde, a.d) - Math.max(rk.dybde, b.d))[0] || null;
    }
    if (valgt) {
      const x = rk.brugt;
      rk.brugt += valgt.w;
      rk.dybde = Math.max(rk.dybde, valgt.d);
      soejler.push({ bund: v, top: null, x, y: rk.y, d: valgt.d, w: valgt.w });
      placeringer.push({ id: v.id, x, y: rk.y, z: 0, d: valgt.d, w: valgt.w, h: v.h, paa: null });
      gulvAreal += valgt.d * valgt.w;
      continue;
    }
    const y0 = rk ? rk.y + rk.dybde : 0;
    const ny = muligheder.filter((o) => y0 + o.d <= Lc).sort((a, b) => a.d - b.d)[0] || null;
    if (!ny) {
      return { ...fejl("gulv", v, `Der er ikke gulvplads til ${v.navn || v.id}: gulvet er brugt op (${Lc}×${Wc} cm).`), ukendte, gulvPct: Math.round((gulvAreal / (Lc * Wc)) * 100) };
    }
    rk = { y: y0, dybde: ny.d, brugt: ny.w };
    raekker.push(rk);
    soejler.push({ bund: v, top: null, x: 0, y: y0, d: ny.d, w: ny.w });
    placeringer.push({ id: v.id, x: 0, y: y0, z: 0, d: ny.d, w: ny.w, h: v.h, paa: null });
    gulvAreal += ny.d * ny.w;
  }

  return { ok: true, sprunget: false, placeringer, gulvPct: Math.round((gulvAreal / (Lc * Wc)) * 100), ukendte };
}
