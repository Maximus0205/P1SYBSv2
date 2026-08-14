import React from "react";
import { LogOut } from "lucide-react";
import { PAGES, PAGES_FOR_ROLE } from "../data/domain";
import { PUNKT1_LOGO_NEGATIV } from "../assets/logo";

function TopNav({ page, onChange, user, onLogOut }) {
  const allowed = PAGES.filter((s) => (PAGES_FOR_ROLE[user.rolle] || []).includes(s.key) || (s.key === "systemadmin" && user.erSystemadmin));
  return (
    <div className="sticky top-0 z-20 bg-[#1A1A1A] mb-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="shrink-0 flex items-center pr-1">
          <img src={PUNKT1_LOGO_NEGATIV} alt="Punkt1" className="h-7 w-auto" />
        </div>
        <div className="flex overflow-x-auto gap-1.5 py-0.5">
          {allowed.map((s) => {
            const Icon = s.icon;
            const active = page === s.key;
            return (
              <button
                key={s.key}
                onClick={() => onChange(s.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 shrink-0 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  active ? "bg-white text-[#1A1A1A]" : "bg-transparent text-[#C9C9C9] hover:text-white"
                }`}
              >
                <Icon size={15} strokeWidth={2.5} />
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-[#C9C9C9] hidden sm:inline pr-1">{user.navn}</span>
          <button
            onClick={onLogOut}
            className="w-10 h-10 rounded-lg bg-black border border-[#333] flex items-center justify-center text-[#C8232E] hover:border-[#C8232E] transition-colors"
            title="Log ud"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export { TopNav };
