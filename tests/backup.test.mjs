import test from "node:test";
import assert from "node:assert/strict";
import { backupAdvarsel, formatBytes, varighed } from "../src/data/backup.js";

const nu = Date.parse("2026-10-26T12:00:00Z");
const h = (t) => new Date(nu - t * 3_600_000).toISOString();

test("ingen backups giver advarsel", () => {
  assert.match(backupAdvarsel([], nu), /ingen gennemført/);
});
test("frisk backup giver ingen advarsel", () => {
  assert.equal(backupAdvarsel([{ status: "ok", startet_at: h(5), faerdig_at: h(5) }], nu), null);
});
test("gammel backup giver advarsel", () => {
  assert.match(backupAdvarsel([{ status: "ok", startet_at: h(40), faerdig_at: h(40) }], nu), /40 timer/);
});
test("seneste fejl advarer selv om en ældre lykkedes", () => {
  const runs = [{ status: "fejl", startet_at: h(1) }, { status: "ok", startet_at: h(12), faerdig_at: h(12) }];
  assert.match(backupAdvarsel(runs, nu), /fejlede/);
});
test("kun en igangværende kørsel tæller ikke som gennemført", () => {
  assert.match(backupAdvarsel([{ status: "koerer", startet_at: h(0) }], nu), /ingen gennemført/);
});
test("formatering", () => {
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2,0 kB");
  assert.equal(varighed({ startet_at: h(0), faerdig_at: new Date(nu + 75_000).toISOString() }), "1 min. 15 sek.");
  assert.equal(varighed({ startet_at: h(0) }), null);
});
