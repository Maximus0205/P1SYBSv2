import React from "react";
import { LogOut } from "lucide-react";
import { PAGES, PAGES_FOR_ROLE } from "../data/domain";
import { PUNKT1_LOGO_NEGATIV } from "../assets/logo";

function TopNav({ page, onChange, user, onLogOut }) {
  const allowed = PAGES.filter((s) => (PAGES_FOR_ROLE[user.rolle] || []).includes(s.key) || (s.key === "systemadmin" && user.erSystemadmin));
  return (
    <div className="sticky top-0 z-20 bg-[#1A1A1A] mb-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="pl-4 pr-2 shrink-0 flex items-center">
          <img src={PUNKT1_LOGO_NEGATIV} alt="Punkt1" className="h-7 w-auto" />
        </div>
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
