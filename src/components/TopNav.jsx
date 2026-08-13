import React from "react";
import { LogOut } from "lucide-react";
import { PAGES, PAGES_FOR_ROLE } from "../data/domain";

// Logo-mærke der efterligner Punkt1s rigtige visuelle identitet: "punkt" i
// fed sort/hvid, med tallet "1" i en rød cirkel-badge. Ingen billedfil
// nødvendig - bygget rent med CSS, så den altid skalerer skarpt.
function BrandMark() {
  return (
    <div className="flex items-center shrink-0 pl-4 pr-2 select-none" aria-label="Punkt1">
      <span className="font-['Barlow_Condensed'] font-bold text-2xl tracking-tight text-white lowercase">punkt</span>
      <span
        className="ml-0.5 w-6 h-6 rounded-full bg-[#C8232E] border-2 border-[#3a3a3a] flex items-center justify-center shrink-0"
        style={{ boxShadow: "inset 0 1px 2px rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.4)" }}
      >
        <span className="text-white text-xs font-bold italic leading-none">1</span>
      </span>
    </div>
  );
}

function TopNav({ page, onChange, user, onLogOut }) {
  const allowed = PAGES.filter((s) => (PAGES_FOR_ROLE[user.rolle] || []).includes(s.key) || (s.key === "systemadmin" && user.erSystemadmin));
  return (
    <div className="sticky top-0 z-20 bg-[#1A1A1A] mb-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <BrandMark />
        <div className="flex overflow-x-auto">
          {allowed.map((s) => {
            const Icon = s.icon;
            const active = page === s.key;
            return (
              <button
                key={s.key}
                onClick={() => onChange(s.key)}
                className="flex items-center gap-2 px-4 sm:px-5 py-3.5 shrink-0 transition-colors"
                style={{ background: active ? "#F2F2F2" : "transparent", color: active ? "#1A1A1A" : "#C9C9C9", borderBottom: active ? "3px solid #C8232E" : "3px solid transparent" }}
              >
                <Icon size={16} strokeWidth={2.5} />
                <span className="text-sm font-semibold uppercase tracking-wide whitespace-nowrap">{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-4 shrink-0">
          <span className="text-xs text-[#C9C9C9] hidden sm:inline">{user.navn}</span>
          <button onClick={onLogOut} className="p-2 text-[#C9C9C9] hover:text-[#C8232E] transition-colors" title="Log ud">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export { TopNav };
