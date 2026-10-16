// Testsider til Playwright. Vælges med ?case=... (se e2e/*.spec.js). De RIGTIGE komponenter, simulerede data.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import "../../src/styles/globals.css";
import { LineItemEditor } from "../../src/components/OrderView.jsx";
import { ErstatningPanel } from "../../src/components/ErstatningPanel.jsx";

const q = new URLSearchParams(location.search);

const katalog = {
  productTypes: [{ id: "vt1", navn: "Køleskab" }, { id: "vt7", navn: "Vaskemaskine" }],
  primaryServices: [{ id: "p3", navn: "Montering" }],
  addOnServices: [{ id: "a1", navn: "Bortskaffelse", minutter: 10, varetyper: ["vt1"] }],
  defaultTimeEstimates: [{ varetypeId: "vt7", primaerYdelseId: "p3", minutter: 45 }],
};

const sag = {
  id: "o1", nr: "26-214", kunde: { navn: "Bosera", telefon: "12 34 56 78" },
  varelinjer: [{ id: "l1", varetypeId: "vt1", varetypeNavn: "Køleskab", maerke: "", model: "KS1", primaerYdelse: { id: "p3", navn: "Montering", minutter: 30 }, tillaeg: [{ id: "a1", navn: "Bortskaffelse", minutter: 10 }] }],
};

function LinjeEditor() {
  const [items, setItems] = useState(sag.varelinjer);
  window.__items = () => items; // så testen kan læse den gemte tilstand
  return <div className="max-w-2xl mx-auto p-4"><LineItemEditor order={sag} catalog={katalog} embedded items={items} onItemsChange={setItems} kraevModel /></div>;
}

function Erstatning() {
  window.__applied = [];
  window.__lukket = false;
  const linje = { id: "l1", varetypeId: "vt7", varetypeNavn: "Vaskemaskine", maerke: "Point", model: "POWM58MKA", mangler: { note: "Ikke på lager (oversolgt)" } };
  return (
    <ErstatningPanel
      order={sag} line={linje} storeId="s1" canChange={q.get("kan") !== "0"}
      onApply={(id, felter) => window.__applied.push([id, felter])}
      onOpenOrder={(id) => { window.__aabnet = id; }}
      onClose={() => { window.__lukket = true; }}
    />
  );
}

const sider = { "linje-editor": LinjeEditor, erstatning: Erstatning };
const Side = sider[q.get("case")];
createRoot(document.getElementById("root")).render(Side ? <Side /> : <p>Ukendt testside</p>);
