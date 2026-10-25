import React from "react";
import { DoorOpen, Wrench, HardHat } from "lucide-react";
import { CASE_TYPES, SAGSTYPE_KUNDE, SAGSTYPE_TOMGANG, SAGSTYPE_SERVICETUR, SAGSTYPE_SPECIALTUR, caseType } from "../data/caseTypes";

// Lille mærkat for sagens type (oktober 2026), genbrugt på sagskort, montørens rutekort og
// sagsdetaljen, så den ser ens ud overalt og i oprettelsesformularen. En almindelig kundesag
// har ingen mærkat (det er standarden); ukendte typer vises heller ikke, i stedet for en
// tom eller forkert mærkat. Typen står altid som tekst - farven er aldrig det eneste tegn.
const IKONER = {
  [SAGSTYPE_TOMGANG]: DoorOpen,
  [SAGSTYPE_SERVICETUR]: Wrench,
  [SAGSTYPE_SPECIALTUR]: HardHat,
};

function CaseTypeBadge({ order }) {
  const id = caseType(order);
  if (id === SAGSTYPE_KUNDE) return null;
  const type = CASE_TYPES.find((t) => t.id === id);
  if (!type) return null;
  const Ikon = IKONER[id];
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border"
      style={{ color: type.farve, borderColor: type.farve }}
    >
      {Ikon && <Ikon size={9} aria-hidden="true" />} {type.kort}
    </span>
  );
}

export { CaseTypeBadge };
