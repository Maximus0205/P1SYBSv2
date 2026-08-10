import React from "react";
import { LogOut } from "lucide-react";
import { PAGES as SIDER, PAGES_FOR_ROLE as SIDER_FOR_ROLLE } from "../data/domain";

function TopNav({ side, onSkift, bruger, onLogUd }) {
  const tilladte = SIDER.filter((s) => (SIDER_FOR_ROLLE[bruger.rolle] || []).includes(s.key) || (s.key === "systemadmin" && bruger.erSystemadmin));
  return (
    <div className="sticky top-0 z-20 bg-[#1C232E] mb-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex overflow-x-auto">
          {tilladte.map((s) => {
            const Icon = s.icon;
            const aktiv = side === s.key;
            return (
              <button
                key={s.key}
                onClick={() => onSkift(s.key)}
                className="flex items-center gap-2 px-4 sm:px-5 py-3.5 shrink-0 transition-colors"
                style={{ background: aktiv ? "#F3EFE6" : "transparent", color: aktiv ? "#1C232E" : "#C9CDD3", borderBottom: aktiv ? "3px solid #E2621B" : "3px solid transparent" }}
              >
                <Icon size={16} strokeWidth={2.5} />
                <span className="text-sm font-semibold uppercase tracking-wide whitespace-nowrap">{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-4 shrink-0">
          <span className="text-xs text-[#C9CDD3] hidden sm:inline">{bruger.navn}</span>
          <button onClick={onLogUd} className="p-2 text-[#C9CDD3] hover:text-[#E2621B] transition-colors" title="Log ud">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Login ----------------



export { TopNav };
