import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import {
  INDBYGGEDE_ROLLER, saetRoller, alleRoller, rolleLabel, rolleAdfaerd, erMontorRolle, erMedhjaelperRolle,
  rollerForButik, standardWidgets, lavRolleNoegle, normaliserRoller,
} from "../src/data/roller.js";

beforeEach(() => saetRoller(INDBYGGEDE_ROLLER));

const TOEMRER = { key: "toemrer", label: "Tømrer", beskrivelse: "", adfaerd: "montor", indbygget: false, sortering: 100 };
const KONTOR = { key: "kontor", label: "Kontor", beskrivelse: "", adfaerd: "standard", indbygget: false, sortering: 101 };

test("indbyggede roller opfører sig som før indlæsningen", () => {
  assert.equal(erMontorRolle("montor"), true);
  assert.equal(erMedhjaelperRolle("medhjaelper"), true);
  assert.equal(erMontorRolle("saelger"), false);
  assert.equal(rolleLabel("lager"), "Lager");
});

test("tom eller ugyldig liste falder tilbage til de indbyggede roller", () => {
  saetRoller([]); assert.equal(alleRoller().length, 5);
  saetRoller(null); assert.equal(alleRoller().length, 5);
  assert.equal(normaliserRoller(undefined), INDBYGGEDE_ROLLER);
});

test("nye roller får adfærd fra databasen; ukendt adfærd bliver almindelig", () => {
  saetRoller([...INDBYGGEDE_ROLLER, TOEMRER, { ...KONTOR, adfaerd: "noget-andet" }]);
  assert.equal(erMontorRolle("toemrer"), true);
  assert.equal(rolleAdfaerd("kontor"), "standard");
  assert.equal(rolleLabel("toemrer"), "Tømrer");
});

test("ukendt rolle: nøglen vises som navn og opfører sig almindeligt", () => {
  assert.equal(rolleLabel("slettet"), "slettet");
  assert.equal(erMontorRolle("slettet"), false);
  assert.equal(erMedhjaelperRolle(undefined), false);
});

test("rettet navn på en indbygget rolle slår igennem", () => {
  saetRoller(INDBYGGEDE_ROLLER.map((r) => (r.key === "montor" ? { ...r, label: "Tekniker" } : r)));
  assert.equal(rolleLabel("montor"), "Tekniker");
});

test("rollerForButik: indbyggede + tilvalgte + brugerens nuværende rolle", () => {
  saetRoller([...INDBYGGEDE_ROLLER, TOEMRER, KONTOR]);
  assert.deepEqual(rollerForButik([]).map((r) => r.key), ["admin", "saelger", "montor", "medhjaelper", "lager"]);
  assert.ok(rollerForButik(["toemrer"]).some((r) => r.key === "toemrer"));
  assert.ok(!rollerForButik(["toemrer"]).some((r) => r.key === "kontor"));
  assert.ok(rollerForButik([], "kontor").some((r) => r.key === "kontor"));
});

test("standardWidgets: indbyggede har faste lister, nye roller afledes af rettigheder og adfærd", () => {
  saetRoller([...INDBYGGEDE_ROLLER, TOEMRER, KONTOR]);
  const defaults = { saelger: ["quick_booking"], montor: ["today_route", "notifications"], medhjaelper: ["today_route", "notifications"] };
  const katalog = [
    { key: "needs_action", requires: "planlaegning" }, { key: "today_route", requires: "montor" }, { key: "pick_list", requires: "lager" },
    { key: "quick_booking", requires: "salg" }, { key: "notifications", requires: null }, { key: "upcoming_today", requires: null },
  ];
  assert.deepEqual(standardWidgets("saelger", [], defaults, katalog), ["quick_booking"]);
  assert.deepEqual(standardWidgets("toemrer", ["salg"], defaults, katalog), ["today_route", "notifications"]);
  assert.deepEqual(standardWidgets("kontor", ["salg", "planlaegning"], defaults, katalog), ["quick_booking", "needs_action", "upcoming_today", "notifications"]);
  assert.deepEqual(standardWidgets("kontor", [], defaults, katalog), ["upcoming_today", "notifications"]);
});

test("lavRolleNoegle: danske tegn, specialtegn og grænser", () => {
  assert.equal(lavRolleNoegle("Tømrer-svend"), "toemrer_svend");
  assert.equal(lavRolleNoegle("  Å  Æ Ø "), "aa_ae_oe");
  assert.equal(lavRolleNoegle("2. mand"), "r_2_mand");
  assert.equal(lavRolleNoegle("!!!"), "");
  assert.ok(lavRolleNoegle("a".repeat(80)).length <= 30);
  assert.match(lavRolleNoegle("Kontor medarbejder"), /^[a-z][a-z0-9_]{1,29}$/);
});
