import React from "react";
import { LogOut } from "lucide-react";
import { PAGES, PAGES_FOR_ROLE } from "../data/domain";

function TopNav({ page, onChange, user, onLogOut }) {
  const allowed = PAGES.filter((s) => (PAGES_FOR_ROLE[user.rolle] || []).includes(s.key) || (s.key === "systemadmin" && user.erSystemadmin));
  return (
    <div className="sticky top-0 z-20 bg-[#1C232E] mb-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex overflow-x-auto">
          {allowed.map((s) => {
            const Icon = s.icon;
            const active = page === s.key;
            return (
              <button
                key={s.key}
                onClick={() => onChange(s.key)}
                className="flex items-center gap-2 px-4 sm:px-5 py-3.5 shrink-0 transition-colors"
                style={{ background: active ? "#F3EFE6" : "transparent", color: active ? "#1C232E" : "#C9CDD3", borderBottom: active ? "3px solid #E2621B" : "3px solid transparent" }}
              >
                <Icon size={16} strokeWidth={2.5} />
                <span className="text-sm font-semibold uppercase tracking-wide whitespace-nowrap">{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-4 shrink-0">
          <span className="text-xs text-[#C9CDD3] hidden sm:inline">{user.navn}</span>
          <button onClick={onLogOut} className="p-2 text-[#C9CDD3] hover:text-[#E2621B] transition-colors" title="Log ud">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export { TopNav };
