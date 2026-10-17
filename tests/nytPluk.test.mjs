// Test af reglen bag "nyt på dagens pluk" (src/lib/nytPlukLogik.js). Kør:  node tests/nytPluk.test.mjs
import assert from "node:assert/strict";
import { nyeNoegler, nytPlukNoegle } from "../src/lib/nytPlukLogik.js";

let antal = 0;
const test = (navn, fn) => { fn(); antal++; console.log("ok  " + navn); };

test("nøgle er ordre + varelinje", () => {
  assert.equal(nytPlukNoegle("o1", "l2"), "o1:l2");
});

test("dagen er ikke set endnu: intet er nyt", () => {
  assert.deepEqual(nyeNoegler(["o1:l1", "o1:l2"], null), []);
  assert.deepEqual(nyeNoegler(["o1:l1"], undefined), []);
});

test("alt er kendt: intet er nyt", () => {
  assert.deepEqual(nyeNoegler(["o1:l1", "o2:l1"], new Set(["o1:l1", "o2:l1"])), []);
});

test("en ny varelinje på en ny sag er nyt", () => {
  assert.deepEqual(nyeNoegler(["o1:l1", "o2:l1"], new Set(["o1:l1"])), ["o2:l1"]);
});

test("en ny varelinje på en kendt sag er nyt", () => {
  assert.deepEqual(nyeNoegler(["o1:l1", "o1:l2"], ["o1:l1"]), ["o1:l2"]);
});

test("en vare, der er fjernet fra listen, giver ikke noget nyt", () => {
  assert.deepEqual(nyeNoegler(["o1:l1"], new Set(["o1:l1", "o9:l1"])), []);
});

test("tom liste og tomt kendt sæt: intet er nyt", () => {
  assert.deepEqual(nyeNoegler([], new Set()), []);
  assert.deepEqual(nyeNoegler(null, new Set(["x"])), []);
});

console.log(`\n${antal} tests bestået`);
