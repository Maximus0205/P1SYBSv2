// KAPACITETSMOTOREN - den digitale disponent (oktober 2026). Ren logik uden afhængigheder (tests/engine.kapacitet.test.mjs).
//
// FORMÅL: for ÉN bil på ÉN dag at afgøre, om en samling stop kan lade sig gøre, og i hvilken rækkefølge og med hvilke
// lager-stop de bedst køres - så montøren når det hele, bilen ikke overlæsses, varerne er der plads til, og kørslen er billigst.
//
// DAGENS FORM (som butikken arbejder): møde ind på lageret -> læsse bilen -> køre alle stop -> hjem og tømme bilen. Kun når vægt
// eller størrelse tvinger det, deles dagen i flere TURE med et lager-stop imellem (omlastning). Skrot afleveres på lageret ved
// samme lejlighed - der pendles aldrig hjem for at aflevere skrot.
//
// VÆGT: nyt produkt af, gammelt på, ca. 1:1 - så vægten på bilen er den samme gennem en tur og lig det, der blev læsset fra
// lageret. Nyttelast til varer = bilens nyttelast - værktøj - (86,5 kg x personer i bilen) - sikkerhedsmargin.
//
// REGLER: hver regel kan være Fra, Rådgivende (giver en advarsel) eller Krav (giver et brud, og planen er ikke ok). Rådgivende
// og Fra styrer IKKE planlægningen (der deles ikke ture for en rådgivende nyttelast); kun Krav gør.
//
// SKØN: mangler en køretidsmatrix, bruges luftlinje x 1,3 ved 50 km/t - og det meldes. Mangler bilens nyttelast eller lasterum,
// springes den del over. Ukendt vægt/mål gættes ALDRIG; det giver en advarsel (eller et brud, hvis admin har sat den til Krav).

import { tilMin, tilHHMM, samlVinduer, faellesVinduer, foersteLedigeStart, sumVinduer, traekFraVinduer } from "./tid.js";
import { rensIndstillinger, niveau, PERSONVAEGT_KG } from "./indstillinger.js";
import { pakVarer, harMaal } from "./pakning.js";

export { rensIndstillinger, PERSONVAEGT_KG, tilMin, tilHHMM };
export { pakVarer, standardStabling } from "./pakning.js";

// ---------------------------------------------------------------------------------------------------------------------
// KØRSEL
// ---------------------------------------------------------------------------------------------------------------------
export function luftlinjeKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Et skøn over køretid og km mellem punkter ud fra koordinater alene (uden ORS).
export function skoenMatrix(punkter) {
  const ids = punkter.map((p) => p.id);
  const km = punkter.map((a) => punkter.map((b) => (a.id === b.id ? 0 : luftlinjeKm(a, b) * 1.3)));
  const minutter = km.map((raekke) => raekke.map((k) => (k / 50) * 60));
  return { ids, minutter, km, skoen: true };
}

function afstandsopslag(matrix, punkterById, ctx) {
  const idx = new Map((matrix?.ids || []).map((id, i) => [id, i]));
  return (a, b) => {
    if (a === b) return { min: 0, km: 0 };
    const i = idx.get(a);
    const j = idx.get(b);
    const m = matrix?.minutter?.[i]?.[j];
    if (i !== undefined && j !== undefined && Number.isFinite(m)) {
      const k = matrix?.km?.[i]?.[j];
      if (matrix.skoen) ctx.skoen = true;
      return { min: m, km: Number.isFinite(k) ? k : (m * 50) / 60 };
    }
    const pa = punkterById.get(a);
    const pb = punkterById.get(b);
    if (pa && pb && Number.isFinite(pa.lat) && Number.isFinite(pb.lat)) {
      const km = luftlinjeKm(pa, pb) * 1.3;
      ctx.skoen = true;
      return { min: (km / 50) * 60, km };
    }
    ctx.mangler = true;
    return { min: 0, km: 0 };
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// PERSONERS TILGÆNGELIGHED - ud fra normal arbejdstid, fravær og "ikke tilgængelig"-tidsrum
// ---------------------------------------------------------------------------------------------------------------------
const ugedag = (dato) => { const d = new Date(`${dato}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };

// raekker: person_work_hours-rækker for personen ({weekday, arbejder, start_min, end_min, pause_min}).
// fravaer: hele dage ({startDato, slutDato|null, type}) - ferie/sygdom. uaendringer: [{dato, fraMin, tilMin}].
export function dagensTilgaengelighed({ dato, raekker = [], fravaer = [], uaendringer = [], indstillinger }) {
  const ind = rensIndstillinger(indstillinger);
  const dag = ugedag(dato);
  const hel = (fravaer || []).find((f) => f && f.startDato <= dato && (!f.slutDato || f.slutDato >= dato));
  if (hel) return { arbejder: false, vinduer: [], pauseMin: 0, aarsag: hel.type === "sygdom" ? "Sygemeldt" : "Ferie/fridag" };

  const raekke = (raekker || []).find((r) => Number(r.weekday) === dag);
  let fra; let til; let pause;
  if (raekke) {
    if (raekke.arbejder === false) return { arbejder: false, vinduer: [], pauseMin: 0, aarsag: "Fri denne ugedag" };
    fra = Number(raekke.start_min); til = Number(raekke.end_min); pause = Number(raekke.pause_min) || 0;
  } else {
    if (!ind.tider.arbejdsdage.includes(dag)) return { arbejder: false, vinduer: [], pauseMin: 0, aarsag: "Fri denne ugedag" };
    fra = tilMin(ind.tider.standardStart); til = tilMin(ind.tider.standardSlut); pause = ind.tider.standardPauseMin;
  }
  const optaget = (uaendringer || []).filter((u) => u && u.dato === dato).map((u) => ({ fra: Number(u.fraMin), til: Number(u.tilMin) }));
  const vinduer = traekFraVinduer([{ fra, til }], optaget);
  return { arbejder: vinduer.length > 0, vinduer, pauseMin: pause, aarsag: vinduer.length ? null : "Ikke tilgængelig hele dagen" };
}

// ---------------------------------------------------------------------------------------------------------------------
// HJÆLPERE
// ---------------------------------------------------------------------------------------------------------------------
const vaegtKendt = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

function udfoldVarer(stop) {
  const ud = [];
  for (const v of stop.varer || []) {
    const antal = Math.max(1, Math.round(Number(v.antal) || 1));
    for (let k = 0; k < antal; k++) {
      ud.push({
        id: antal > 1 ? `${v.id}#${k + 1}` : String(v.id), vareId: v.id, navn: v.navn || "", type: v.type || v.navn || "",
        vaegtKg: vaegtKendt(v.vaegtKg) ? Number(v.vaegtKg) : null, maal: v.maal || null, stabling: v.stabling, stopId: stop.id, stopNavn: stop.navn || stop.id,
      });
    }
  }
  return ud;
}

const sumVaegt = (varer) => varer.reduce((s, v) => s + (v.vaegtKg ?? 0), 0);

function andelAf(del, alle) {
  if (!alle.length) return 1;
  const total = sumVaegt(alle);
  if (alle.every((v) => v.vaegtKg !== null) && total > 0) return sumVaegt(del) / total;
  return del.length / alle.length;
}

// ---------------------------------------------------------------------------------------------------------------------
// KONTEKST
// ---------------------------------------------------------------------------------------------------------------------
function byggKontekst(input, ind) {
  const personer = (input.personer || []).map((p) => ({
    ...p, rolle: p.rolle === "medhjaelper" ? "medhjaelper" : "montoer", vinduer: samlVinduer(p.vinduer || []),
  })).filter((p) => p.vinduer.length > 0);
  const montoerer = personer.filter((p) => p.rolle === "montoer").sort((a, b) => sumVinduer(b.vinduer) - sumVinduer(a.vinduer));
  const primaer = montoerer[0] || null;
  const helpere = personer.filter((p) => p.rolle === "medhjaelper");
  const overtidMin = ind.tider.tilladtOvertidMin;
  // Tilladt overtid forlænger det SIDSTE vindue, så aktiviteter kan ligge i overtiden uden at give brud hver for sig.
  const forlaeng = (v) => v.map((w, i) => (i === v.length - 1 ? { fra: w.fra, til: w.til + overtidMin } : w));
  const vinduerM = primaer ? forlaeng(primaer.vinduer) : [];
  const vinduerH = forlaeng(samlVinduer(helpere.flatMap((h) => h.vinduer)));

  const bil = input.bil || {};
  const antalPersoner = personer.length;
  const nytte = Number(bil.nyttelastKg);
  const vaerktoej = Number(bil.vaerktoejKg) || 0;
  const margin = ind.nyttelast.sikkerhedsmarginPct;
  const brutto = Number.isFinite(nytte) && nytte > 0 ? nytte - vaerktoej - PERSONVAEGT_KG * antalPersoner : null;
  const tilladtKg = brutto === null ? null : Math.max(0, brutto * (1 - margin / 100));
  const lr = bil.lasterum || {};
  const lasterum = [lr.laengdeCm, lr.breddeCm, lr.hoejdeCm].every((x) => Number(x) > 0)
    ? { laengdeCm: Number(lr.laengdeCm), breddeCm: Number(lr.breddeCm), hoejdeCm: Number(lr.hoejdeCm) } : null;

  const lagerPunkt = { id: "lager", lat: input.lager?.lat ?? ind.lager.lat, lon: input.lager?.lon ?? ind.lager.lon, navn: "Lager" };
  const punkterById = new Map([["lager", lagerPunkt], ...(input.stop || []).map((s) => [s.id, s])]);
  const ctx = { skoen: false, mangler: false };
  ctx.afstand = afstandsopslag(input.matrix, punkterById, ctx);

  const dagStart = vinduerM.length ? vinduerM[0].fra : 0;
  const dagSlut = primaer ? primaer.vinduer[primaer.vinduer.length - 1].til : 0;
  const lev = (regel) => niveau(ind, regel);
  return Object.assign(ctx, {
    ind, personer, primaer, helpere, antalPersoner, vinduerM, vinduerH, harHelper: vinduerH.length > 0,
    bil, pace: (Number(bil.tempo) || 100) / 100, tilladtKg, brutto, margin, lasterum, emballage: ind.pakning.emballageMarginCm,
    dagStart, dagSlut, overtid: overtidMin, pauseMin: Math.max(0, Number(input.pauseMin ?? primaer?.pauseMin ?? ind.tider.standardPauseMin) || 0),
    pauseEfterMin: ind.tider.pauseEfterMin, trafik: ind.koersel.trafikTillaegPct / 100,
    krav: { nyttelast: lev("nyttelast") === "krav", plads: lev("plads") === "krav" }, lev, vaerktoej,
  });
}

// Kan disse varer (hver med stopNr = besøgets plads på turen) være på bilen sammen?
function kanBaeres(varer, ctx) {
  if (ctx.krav.nyttelast && ctx.tilladtKg !== null && sumVaegt(varer) > ctx.tilladtKg + 1e-9) return false;
  if (ctx.krav.plads && ctx.lasterum) {
    const p = pakVarer({ lasterum: ctx.lasterum, varer: varer.filter((v) => harMaal(v.maal)), emballageMarginCm: ctx.emballage });
    if (!p.ok) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// TRIN 1: del rækkefølgen af stop op i ture (og besøg), så hver tur kan bæres
// ---------------------------------------------------------------------------------------------------------------------
function deltIture(sekvens, ctx) {
  const ture = [];
  const ufoerbare = [];
  const nyTur = () => ({ besoeg: [], varer: [] });
  let aktuel = nyTur();

  for (const stop of sekvens) {
    const alle = udfoldVarer(stop);
    let rest = alle;
    let foerste = true;
    for (let sikring = 0; sikring < 500; sikring++) {
      const nr = aktuel.besoeg.length;
      const med = (liste) => liste.map((v) => ({ ...v, stopNr: nr }));
      if (rest.length === 0) { aktuel.besoeg.push({ stop, varer: [], andel: 1 }); break; }
      if (kanBaeres([...aktuel.varer, ...med(rest)], ctx)) {
        aktuel.varer.push(...med(rest));
        aktuel.besoeg.push({ stop, varer: rest, andel: andelAf(rest, alle) });
        break;
      }
      // Hele stoppet i en frisk tur frem for at dele det mellem to ture?
      if (aktuel.varer.length > 0 && foerste && rest.length === alle.length && kanBaeres(alle.map((v) => ({ ...v, stopNr: 0 })), ctx)) {
        ture.push(aktuel); aktuel = nyTur(); continue;
      }
      const ind = []; const ud = [];
      for (const v of rest) (kanBaeres([...aktuel.varer, ...med(ind), { ...v, stopNr: nr }], ctx) ? ind : ud).push(v);
      if (ind.length === 0) {
        if (aktuel.varer.length === 0) {
          // Ikke engang alene i en tom tur: kan aldrig bæres. Planen får et brud, men stoppet beholdes, så resten kan regnes.
          ufoerbare.push(...rest);
          aktuel.varer.push(...med(rest));
          aktuel.besoeg.push({ stop, varer: rest, andel: andelAf(rest, alle) });
          break;
        }
        ture.push(aktuel); aktuel = nyTur(); continue;
      }
      aktuel.varer.push(...med(ind));
      aktuel.besoeg.push({ stop, varer: ind, andel: andelAf(ind, alle) });
      foerste = false;
      rest = ud;
      ture.push(aktuel); aktuel = nyTur();
    }
  }
  if (aktuel.besoeg.length) ture.push(aktuel);
  return { ture, ufoerbare };
}

// ---------------------------------------------------------------------------------------------------------------------
// TRIN 2: regn dagen igennem i tid, og find alle brud
// ---------------------------------------------------------------------------------------------------------------------
function simuler(sekvens, ctx) {
  const { ture, ufoerbare } = deltIture(sekvens, ctx);
  const haendelser = [];
  const funde = []; // { regel, besked, stopId?, tal?, vaegt }
  const fund = (regel, besked, vaegt, ekstra = {}) => { if (ctx.lev(regel) !== "fra") funde.push({ regel, niveau: ctx.lev(regel), besked, vaegt, ...ekstra }); };

  let t = ctx.dagStart; let km = 0; let koerMin = 0; let ventMin = 0; let arbejdMin = 0; let laesMin = 0; let omlastMin = 0; let pauseTaget = false; let pauseMin = 0;
  const udenfor = new Set();
  const push = (type, fra, til, ekstra = {}) => haendelser.push({ type, fra, til, minutter: til - fra, ...ekstra });
  const vent = (til, aarsag) => { if (til > t) { push("vent", t, til, { aarsag }); ventMin += til - t; t = til; } };
  const tagPause = () => {
    if (!pauseTaget && ctx.pauseMin > 0 && t - ctx.dagStart >= ctx.pauseEfterMin && t + ctx.pauseMin <= ctx.dagSlut + ctx.overtid) {
      push("pause", t, t + ctx.pauseMin); t += ctx.pauseMin; pauseMin += ctx.pauseMin; pauseTaget = true;
    }
  };
  // Aktivitet, der kræver montøren til stede; ikke afbrydelig. Ender den uden for kalenderen, noteres det.
  const aktivitet = (varighed, vinduer, hvad) => {
    const s = foersteLedigeStart(vinduer, t, varighed);
    if (s === null) {
      // Ligger det efter dagens slutning, fanger slut-tjekket det som ÉT tydeligt brud; her meldes kun huller midt på dagen.
      if (t + varighed <= ctx.dagSlut + ctx.overtid && !udenfor.has(hvad)) { udenfor.add(hvad); fund("arbejdstid", `${hvad} kan ikke ligge inden for montørens arbejdstid.`, 2); }
      return t;
    }
    vent(s, "Montøren er ikke tilgængelig");
    return s;
  };
  const koer = (fra, til) => {
    const d = ctx.afstand(fra, til);
    const min = d.min * (1 + ctx.trafik);
    aktivitet(min, ctx.vinduerM, "Kørsel");
    push("koersel", t, t + min, { fraSted: fra, tilSted: til, km: Math.round(d.km * 10) / 10 });
    t += min; km += d.km; koerMin += min;
  };

  const ml = ctx.ind.tider.morgenLaesningMin;
  aktivitet(ml, ctx.vinduerM, "Morgenlæsning");
  push("laes", t, t + ml, { sted: "lager" }); t += ml; laesMin += ml;

  let sted = "lager";
  ture.forEach((tur, ti) => {
    if (ti > 0) {
      tagPause();
      koer(sted, "lager");
      const om = ctx.ind.tider.omlastningMin;
      aktivitet(om, ctx.vinduerM, "Omlastning");
      push("omlastning", t, t + om, { tur: ti + 1 }); t += om; omlastMin += om;
      sted = "lager";
    }
    tur.besoeg.forEach((b) => {
      tagPause();
      const stop = b.stop;
      koer(sted, stop.id);
      const arbejde = Math.round(Number(stop.minutter || 0) * ctx.pace * b.andel) + ctx.ind.tider.stopBufferMin;
      const to = !!stop.kraever2Mand;
      const vinduer = to && ctx.harHelper ? faellesVinduer(ctx.vinduerM, ctx.vinduerH) : ctx.vinduerM;
      const tidsrum = stop.tidsrum && Number.isFinite(stop.tidsrum.fra) ? stop.tidsrum : null;
      if (tidsrum) vent(Math.max(t, tidsrum.fra), "Venter på kundens tidsrum");
      const start = foersteLedigeStart(vinduer, t, arbejde);
      if (start === null && t + arbejde <= ctx.dagSlut + ctx.overtid) {
        fund("arbejdstid", `${stop.navn || stop.id} kan ikke nås inden for ${to ? "den fælles arbejdstid for montør og medhjælper" : "montørens arbejdstid"}.`, 2, { stopId: stop.id });
      } else if (start !== null) {
        vent(start, to ? "Montør og medhjælper er ikke begge til stede" : "Montøren er ikke tilgængelig");
      }
      push("stop", t, t + arbejde, { stopId: stop.id, navn: stop.navn || stop.id, adresse: stop.adresse || "", tur: ti + 1, varer: b.varer.map((v) => v.id), kraever2Mand: to });
      t += arbejde; arbejdMin += arbejde;
      if (tidsrum && Number.isFinite(tidsrum.til) && t > tidsrum.til) {
        fund("tidsrum", `${stop.navn || stop.id} bliver først færdigt kl. ${tilHHMM(t)}, men kundens tidsrum slutter kl. ${tilHHMM(tidsrum.til)}.`, 1 + (t - tidsrum.til) / 10, { stopId: stop.id, tal: { overMin: Math.round(t - tidsrum.til) } });
      }
      sted = stop.id;
    });
  });

  tagPause();
  koer(sted, "lager");
  const afs = ctx.ind.tider.dagsafslutningMin;
  aktivitet(afs, ctx.vinduerM, "Tømning af bilen");
  push("hjem", t, t + afs, { sted: "lager" }); t += afs;
  const slutMin = t;
  const grænse = ctx.dagSlut + ctx.overtid;
  if (slutMin > grænse + 1e-9) {
    fund("arbejdstid", `Dagen slutter først kl. ${tilHHMM(slutMin)}, ${Math.round(slutMin - ctx.dagSlut)} min efter arbejdstidens slutning (${tilHHMM(ctx.dagSlut)})${ctx.overtid ? ` - ${ctx.overtid} min overtid er tilladt` : ""}.`, 1 + (slutMin - grænse) / 10, { tal: { overMin: Math.round(slutMin - ctx.dagSlut) } });
  }

  // To-mands-krav
  const harToMandStop = sekvens.filter((s) => s.kraever2Mand);
  if (harToMandStop.length && !ctx.harHelper) {
    harToMandStop.forEach((s) => fund("toMand", `${s.navn || s.id} kræver to mand, men der er ingen medhjælper på bilen denne dag.`, 3, { stopId: s.id }));
  }

  // Vægt og plads pr. tur
  const tureUd = ture.map((tur, i) => {
    const kg = sumVaegt(tur.varer);
    const pak = ctx.lasterum ? pakVarer({ lasterum: ctx.lasterum, varer: tur.varer.filter((v) => harMaal(v.maal)), emballageMarginCm: ctx.emballage }) : null;
    return { nr: i + 1, besoeg: tur.besoeg.map((b) => ({ stopId: b.stop.id, navn: b.stop.navn || b.stop.id, varer: b.varer.map((v) => v.id) })), vaegtKg: Math.round(kg * 10) / 10, tilladtKg: ctx.tilladtKg === null ? null : Math.round(ctx.tilladtKg * 10) / 10, gulvPct: pak && !pak.sprunget ? pak.gulvPct : null, pakning: pak, varer: tur.varer };
  });
  const ufId = new Set(ufoerbare.map((v) => v.id));
  tureUd.forEach((tu) => {
    if (ctx.tilladtKg !== null && tu.vaegtKg > ctx.tilladtKg + 1e-9) {
      const alene = tu.varer.length === 1 || tu.varer.every((v) => ufId.has(v.id));
      fund("nyttelast", alene && tu.varer.length === 1
        ? `${tu.varer[0].navn || tu.varer[0].id} (${tu.vaegtKg} kg) er for tung til bilen alene (tilladt ${tu.tilladtKg} kg).`
        : `Tur ${tu.nr}: ${tu.vaegtKg} kg på bilen mod ${tu.tilladtKg} kg tilladt.`, 1 + (tu.vaegtKg - ctx.tilladtKg) / 50, { tal: { vaegtKg: tu.vaegtKg, tilladtKg: tu.tilladtKg, tur: tu.nr } });
    }
    if (tu.pakning && !tu.pakning.ok) fund("plads", `Tur ${tu.nr}: ${tu.pakning.besked}`, 1, { tal: { tur: tu.nr } });
  });

  // Ukendte data: gættes aldrig
  const alleVarer = tureUd.flatMap((tu) => tu.varer);
  if (ctx.tilladtKg !== null) {
    const u = alleVarer.filter((v) => v.vaegtKg === null);
    if (u.length) fund("ukendtData", `Vægt mangler på: ${[...new Set(u.map((v) => v.navn || v.id))].join(", ")} - indgår som 0 kg i nyttelastberegningen.`, 1);
  }
  if (ctx.lasterum) {
    const u = alleVarer.filter((v) => !harMaal(v.maal));
    if (u.length) fund("ukendtData", `Mål mangler på: ${[...new Set(u.map((v) => v.navn || v.id))].join(", ")} - indgår ikke i pladsberegningen.`, 1);
  }

  const totalMin = slutMin - ctx.dagStart;
  const betaltMin = Math.max(0, totalMin - pauseMin);
  const timeKr = (betaltMin / 60) * ctx.ind.oekonomi.timeprisKr * Math.max(1, ctx.antalPersoner);
  const kmKr = km * ctx.ind.oekonomi.kmprisKr;
  const brud = funde.filter((f) => f.niveau === "krav");
  const advarsler = funde.filter((f) => f.niveau === "raadgivende");
  const hard = brud.reduce((s, f) => s + f.vaegt, 0) + ufoerbare.length * 3;
  const blød = advarsler.reduce((s, f) => s + f.vaegt, 0);
  return {
    score: [hard, blød, timeKr + kmKr],
    haendelser, ture: tureUd, brud, advarsler, ufoerbare,
    noegletal: {
      startMin: ctx.dagStart, slutMin, hjemmeKl: tilHHMM(slutMin), koerselMin: Math.round(koerMin), km: Math.round(km * 10) / 10, arbejdeMin: arbejdMin,
      venteMin: Math.round(ventMin), laesningMin: laesMin, omlastninger: Math.max(0, ture.length - 1), omlastningMin: omlastMin, pauseMin,
      ledigMin: Math.max(0, Math.round(ctx.dagSlut + ctx.overtid - slutMin)), omkostningKr: Math.round(timeKr + kmKr), timeKr: Math.round(timeKr), kmKr: Math.round(kmKr),
    },
  };
}

const bedre = (a, b) => { for (let i = 0; i < a.score.length; i++) { if (a.score[i] < b.score[i] - 1e-9) return true; if (a.score[i] > b.score[i] + 1e-9) return false; } return false; };

// ---------------------------------------------------------------------------------------------------------------------
// TRIN 3: find den bedste rækkefølge
// ---------------------------------------------------------------------------------------------------------------------
function permutationer(liste, fn) {
  const a = [...liste];
  const n = a.length;
  const c = new Array(n).fill(0);
  fn(a);
  let i = 0;
  while (i < n) {
    if (c[i] < i) { const k = i % 2 === 0 ? 0 : c[i]; [a[k], a[i]] = [a[i], a[k]]; fn(a); c[i]++; i = 0; } else { c[i] = 0; i++; }
  }
}

function optimer(stop, ctx) {
  const n = stop.length;
  if (n <= 1) return { ...simuler(stop, ctx), raekkefoelge: [...stop] };
  let bedst = null;
  if (n <= 7) {
    permutationer(stop, (p) => { const s = simuler(p, ctx); if (!bedst || bedre(s, bedst)) bedst = { ...s, raekkefoelge: [...p] }; });
    return bedst;
  }
  // Heuristik: nærmeste nabo fra lageret, derefter 2-opt og flytning af enkelte stop, så længe det forbedrer.
  const rest = [...stop]; const start = []; let nu = "lager";
  while (rest.length) {
    let bi = 0; let bm = Infinity;
    rest.forEach((s, i) => { const m = ctx.afstand(nu, s.id).min; if (m < bm) { bm = m; bi = i; } });
    const [v] = rest.splice(bi, 1); start.push(v); nu = v.id;
  }
  bedst = { ...simuler(start, ctx), raekkefoelge: start };
  for (let runde = 0; runde < 40; runde++) {
    let forbedret = false;
    const kandidater = [];
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) kandidater.push([...bedst.raekkefoelge.slice(0, i), ...bedst.raekkefoelge.slice(i, j + 1).reverse(), ...bedst.raekkefoelge.slice(j + 1)]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) { const k = [...bedst.raekkefoelge]; const [v] = k.splice(i, 1); k.splice(j, 0, v); kandidater.push(k); }
    for (const k of kandidater) { const s = simuler(k, ctx); if (bedre(s, bedst)) { bedst = { ...s, raekkefoelge: k }; forbedret = true; } }
    if (!forbedret) break;
  }
  return bedst;
}

// ---------------------------------------------------------------------------------------------------------------------
// OFFENTLIG API
// ---------------------------------------------------------------------------------------------------------------------
// input: { dato, indstillinger, lager?:{lat,lon}, bil:{id,navn,tempo,nyttelastKg,vaerktoejKg,lasterum:{laengdeCm,breddeCm,hoejdeCm}},
//          personer:[{id,navn,rolle:'montoer'|'medhjaelper',vinduer:[{fra,til}]}], pauseMin?, stop:[...], matrix? }
// stop:    { id, navn, adresse?, lat?, lon?, minutter, tidsrum?:{fra,til}, kraever2Mand?, varer:[{id,navn,type,antal,vaegtKg,maal:{l,b,h}}] }
export function planlaegDag(input) {
  const ind = rensIndstillinger(input.indstillinger);
  const ctx = byggKontekst(input, ind);
  const stop = (input.stop || []).filter((s) => s && s.id);

  const forudsaetninger = {
    personVaegtKg: PERSONVAEGT_KG, antalPersoner: ctx.antalPersoner, nyttelastKg: Number(ctx.bil.nyttelastKg) > 0 ? Number(ctx.bil.nyttelastKg) : null,
    vaerktoejKg: ctx.vaerktoej, tilladtKg: ctx.tilladtKg === null ? null : Math.round(ctx.tilladtKg * 10) / 10, sikkerhedsmarginPct: ctx.margin,
    lasterumSat: !!ctx.lasterum, tempoPct: Math.round(ctx.pace * 100), trafikTillaegPct: ind.koersel.trafikTillaegPct, harMedhjaelper: ctx.harHelper,
    skoenKoersel: false, dagStart: tilHHMM(ctx.dagStart), dagSlut: tilHHMM(ctx.dagSlut),
  };

  if (!ctx.primaer) {
    const besked = "Ingen montør er tilgængelig på bilen denne dag.";
    const brud = ctx.lev("arbejdstid") === "fra" ? [] : [{ regel: "arbejdstid", niveau: ctx.lev("arbejdstid"), besked, vaegt: 5 }];
    // Uden stop er en dag uden montør ikke en fejl, blot en dag uden kapacitet.
    const kritisk = stop.length === 0 ? [] : brud.filter((b) => b.niveau === "krav");
    return { ok: kritisk.length === 0, dato: input.dato, bil: { id: ctx.bil.id, navn: ctx.bil.navn }, haendelser: [], ture: [], rutefolge: [], brud: kritisk, advarsler: stop.length === 0 ? [] : brud.filter((b) => b.niveau !== "krav"), noegletal: { ledigMin: 0, startMin: null, slutMin: null, hjemmeKl: null, koerselMin: 0, km: 0, arbejdeMin: 0, venteMin: 0, laesningMin: 0, omlastninger: 0, omlastningMin: 0, pauseMin: 0, omkostningKr: 0, timeKr: 0, kmKr: 0 }, forklaring: [besked], forudsaetninger };
  }

  if (stop.length === 0) {
    const ledig = Math.max(0, sumVinduer(ctx.primaer.vinduer) - ctx.pauseMin);
    return { ok: true, dato: input.dato, bil: { id: ctx.bil.id, navn: ctx.bil.navn }, haendelser: [], ture: [], rutefolge: [], brud: [], advarsler: [], noegletal: { ledigMin: ledig, startMin: ctx.dagStart, slutMin: null, hjemmeKl: null, koerselMin: 0, km: 0, arbejdeMin: 0, venteMin: 0, laesningMin: 0, omlastninger: 0, omlastningMin: 0, pauseMin: 0, omkostningKr: 0, timeKr: 0, kmKr: 0 }, forklaring: [`Ingen stop - ${Math.floor(ledig / 60)} t ${ledig % 60} min ledig.`], forudsaetninger };
  }

  const bedst = optimer(stop, ctx);
  forudsaetninger.skoenKoersel = ctx.skoen;
  const advarsler = [...bedst.advarsler];
  if (ctx.skoen) advarsler.push({ regel: "koersel", niveau: "raadgivende", besked: "Køretiden er et skøn (luftlinje), fordi en rigtig køretidsmatrix ikke var tilgængelig.", vaegt: 0 });
  if (ctx.mangler) advarsler.push({ regel: "koersel", niveau: "raadgivende", besked: "Der mangler koordinater på mindst ét stop - køretid til/fra det indgår som 0.", vaegt: 0 });

  const n = bedst.noegletal;
  const forklaring = [];
  forklaring.push(`Rækkefølge: ${bedst.raekkefoelge.map((s) => s.navn || s.id).join(" → ")}.`);
  if (bedst.ture.length > 1) {
    bedst.ture.forEach((tu, i) => { if (i > 0) forklaring.push(`Tur ${tu.nr} er nødvendig, fordi alt ikke kan være på bilen på én gang (${bedst.ture[i - 1].vaegtKg} kg på tur ${i}${ctx.tilladtKg !== null ? `, højst ${forudsaetninger.tilladtKg} kg` : ""}). Det koster ${ind.tider.omlastningMin} min omlastning plus kørsel til lageret og tilbage.`); });
  }
  forklaring.push(`Kørsel ${n.km} km / ${n.koerselMin} min, arbejde ${n.arbejdeMin} min${n.venteMin ? `, ventetid ${n.venteMin} min` : ""}. Hjemme og tømt kl. ${n.hjemmeKl}; ${n.ledigMin} min tilbage af arbejdstiden. Anslået omkostning ca. ${n.omkostningKr} kr (løn ${n.timeKr} kr + kørsel ${n.kmKr} kr).`);
  bedst.ture.forEach((tu) => { if (tu.tilladtKg !== null) forklaring.push(`Tur ${tu.nr}: ${tu.vaegtKg} kg af ${tu.tilladtKg} kg tilladt${tu.gulvPct !== null ? `, gulvet ${tu.gulvPct} % brugt` : ""}.`); });
  const tilladtLinje = ctx.tilladtKg !== null ? `Tilladt vægt på bilen = nyttelast ${forudsaetninger.nyttelastKg} kg − værktøj ${ctx.vaerktoej} kg − ${ctx.antalPersoner} ${ctx.antalPersoner === 1 ? "person" : "personer"} á ${PERSONVAEGT_KG} kg − ${ctx.margin} % sikkerhedsmargin = ${forudsaetninger.tilladtKg} kg.` : null;
  if (tilladtLinje) forklaring.push(tilladtLinje);

  return {
    ok: bedst.brud.length === 0 && bedst.ufoerbare.length === 0, dato: input.dato, bil: { id: ctx.bil.id, navn: ctx.bil.navn },
    haendelser: bedst.haendelser, rutefolge: bedst.raekkefoelge.map((s) => s.id), ture: bedst.ture.map(({ varer, pakning, ...tu }) => ({ ...tu, pakning: pakning ? { ok: pakning.ok, aarsag: pakning.aarsag || null, besked: pakning.besked || null, placeringer: pakning.placeringer } : null })),
    brud: bedst.brud, advarsler, noegletal: n, forklaring, forudsaetninger,
  };
}

// Hvad koster det at lægge ét stop mere på denne bil og dag? (grundlag for forslag ved booking)
// Matricen i input skal dække det nye stop også.
export function vurderTilfoejelse(input, nytStop) {
  const foer = planlaegDag(input);
  const efter = planlaegDag({ ...input, stop: [...(input.stop || []), nytStop] });
  const a = foer.noegletal || {};
  const b = efter.noegletal || {};
  return {
    mulig: efter.ok,
    efter,
    foer,
    ekstra: efter.noegletal && foer.noegletal && foer.noegletal.slutMin !== null ? {
      min: Math.round((b.slutMin - a.slutMin) * 10) / 10, km: Math.round((b.km - a.km) * 10) / 10, kr: b.omkostningKr - a.omkostningKr, omlastninger: b.omlastninger - a.omlastninger,
    } : efter.noegletal ? { min: Math.round((b.slutMin - b.startMin) * 10) / 10, km: b.km, kr: b.omkostningKr, omlastninger: b.omlastninger } : null,
    aarsager: efter.brud.map((x) => x.besked),
  };
}
