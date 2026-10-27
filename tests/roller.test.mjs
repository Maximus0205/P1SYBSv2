import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import {
  FALLBACK_ROLLER, saetRoller, alleRoller, rolleLabel, rolleAdfaerd, erMontorRolle, erMedhjaelperRolle,
  rollerForButik, standardWidgets, lavRolleNoegle, normaliserRoller,
} from "../src/data/roller.js";

beforeEach(() => saetRoller(FALLBACK_ROLLER));

const TOEMRER = { key: "toemrer", label: "Tømrer", beskrivelse: "", adfaerd: "montor", sortering: 100 };
const KONTOR = { key: "kontor", label: "Kontor", beskrivelse: "", adfaerd: "standard", sortering: 101 };

test("nødlisten opfører sig som de gamle roller, hvis databasen ikke svarer", () => {
  assert.equal(erMontorRolle("montor"), true);
  assert.equal(erMedhjaelperRolle("medhjaelper"), true);
  assert.equal(erMontorRolle("saelger"), false);
  assert.equal(rolleLabel("lager"), "Lager");
});

test("tom eller ugyldig liste falder tilbage til de indbyggede roller", () => {
  saetRoller([]); assert.equal(alleRoller().length, 5);
  saetRoller(null); assert.equal(alleRoller().length, 5);
  assert.equal(normaliserRoller(undefined), FALLBACK_ROLLER);
});

test("nye roller får adfærd fra databasen; ukendt adfærd bliver almindelig", () => {
  saetRoller([...FALLBACK_ROLLER, TOEMRER, { ...KONTOR, adfaerd: "noget-andet" }]);
  assert.equal(erMontorRolle("toemrer"), true);
  assert.equal(rolleAdfaerd("kontor"), "standard");
  assert.equal(rolleLabel("toemrer"), "Tømrer");
});

test("ukendt rolle: nøglen vises som navn og opfører sig almindeligt", () => {
  assert.equal(rolleLabel("slettet"), "slettet");
  assert.equal(erMontorRolle("slettet"), false);
  assert.equal(erMedhjaelperRolle(undefined), false);
});

test("rettet navn på en rolle slår igennem", () => {
  saetRoller(FALLBACK_ROLLER.map((r) => (r.key === "montor" ? { ...r, label: "Tekniker" } : r)));
  assert.equal(rolleLabel("montor"), "Tekniker");
});

test("rollerForButik: kun tilvalgte roller + brugerens nuværende rolle", () => {
  saetRoller([...FALLBACK_ROLLER, TOEMRER, KONTOR]);
  assert.deepEqual(rollerForButik([]).map((r) => r.key), []);
  assert.deepEqual(rollerForButik(["saelger", "toemrer"]).map((r) => r.key), ["saelger", "toemrer"]);
  assert.ok(rollerForButik(["saelger"], "kontor").some((r) => r.key === "kontor"));
  assert.ok(!rollerForButik(["saelger"]).some((r) => r.key === "kontor"));
});

test("normaliserRoller læser databasens kolonner (forside_widgets, ny_butik_standard)", () => {
  const [r] = normaliserRoller([{ key: "x", label: "X", adfaerd: "montor", sortering: 5, ny_butik_standard: true, forside_widgets: ["today_route"] }]);
  assert.equal(r.nyButikStandard, true);
  assert.deepEqual(r.forside, ["today_route"]);
  assert.equal(normaliserRoller([{ key: "y", label: "Y" }])[0].forside, null);
});

const KATALOG = [
  { key: "needs_action", requires: "planlaegning" }, { key: "today_route", requires: "montor" }, { key: "pick_list", requires: "lager" },
  { key: "quick_booking", requires: "salg" }, { key: "notifications", requires: null }, { key: "upcoming_today", requires: null },
];

test("standardWidgets: rollens egen liste filtreres på rettigheder og kataloget", () => {
  saetRoller([{ key: "kontor", label: "Kontor", forside_widgets: ["pick_list", "quick_booking", "findes_ikke", "notifications"] }]);
  assert.deepEqual(standardWidgets("kontor", ["salg"], KATALOG), ["quick_booking", "notifications"]);
  assert.deepEqual(standardWidgets("kontor", null, KATALOG), ["pick_list", "quick_booking", "notifications"]); // ubegrænset
});

test("standardWidgets: uden egen liste afledes den af rettighederne i fast rækkefølge", () => {
  saetRoller([{ key: "kontor", label: "Kontor" }]);
  assert.deepEqual(standardWidgets("kontor", ["salg", "planlaegning"], KATALOG), ["quick_booking", "needs_action", "upcoming_today", "notifications"]);
  assert.deepEqual(standardWidgets("kontor", [], KATALOG), ["upcoming_today", "notifications"]);
  assert.deepEqual(standardWidgets("ukendt", ["lager"], KATALOG), ["pick_list", "upcoming_today", "notifications"]);
});

const KATALOG_NY = [...KATALOG, { key: "dagen_i_tal", requires: null }, { key: "bil_status", requires: "planlaegning" }, { key: "haster", requires: "planlaegning" }, { key: "mine_sager", requires: "salg" }, { key: "pluk_biler", requires: "lager" }];
test("standardWidgets: indbyggede roller får hver sin forside (oktober 2026)", () => {
  saetRoller([{ key: "admin", label: "A" }, { key: "saelger", label: "S" }, { key: "lager", label: "L" }, { key: "kontor", label: "K" }]);
  const alle = ["salg", "planlaegning", "lager", "montor"];
  assert.deepEqual(standardWidgets("admin", alle, KATALOG_NY), ["dagen_i_tal", "bil_status", "haster", "needs_action", "pluk_biler", "notifications", "quick_booking"]);
  assert.deepEqual(standardWidgets("saelger", ["salg", "planlaegning"], KATALOG_NY), ["dagen_i_tal", "mine_sager", "quick_booking", "haster", "notifications"]);
  assert.deepEqual(standardWidgets("lager", ["lager"], KATALOG_NY), ["dagen_i_tal", "pluk_biler", "pick_list", "upcoming_today", "notifications"]);
  assert.deepEqual(standardWidgets("kontor", ["salg"], KATALOG_NY), ["dagen_i_tal", "quick_booking", "upcoming_today", "notifications"]);
});

test("lavRolleNoegle: danske tegn, specialtegn og grænser", () => {
  assert.equal(lavRolleNoegle("Tømrer-svend"), "toemrer_svend");
  assert.equal(lavRolleNoegle("  Å  Æ Ø "), "aa_ae_oe");
  assert.equal(lavRolleNoegle("2. mand"), "r_2_mand");
  assert.equal(lavRolleNoegle("!!!"), "");
  assert.ok(lavRolleNoegle("a".repeat(80)).length <= 30);
  assert.match(lavRolleNoegle("Kontor medarbejder"), /^[a-z][a-z0-9_]{1,29}$/);
});
