import React, { useEffect, useRef, useState } from "react";
import { LogOut, Bell, Package, AlertTriangle, Copy } from "lucide-react";
import { PAGES, PAGES_FOR_ROLE } from "../data/domain";
import { PUNKT1_LOGO_NEGATIV } from "../assets/logo";

// Notifikationsklokke: viser, for den INDLOGGEDE bruger, hvilke af DERES
// EGNE bookede sager der har noget nyt siden sidst - materialeforbrug
// tilføjet af montøren, et problem markeret (sagen kunne ikke gennemføres
// som planlagt), eller en opfølgningssag oprettet ud fra den. Rent i
// systemet (ingen push/e-mail) - synlig hver gang man er logget ind,
// uanset hvilken fane man står på. Forsvinder fra listen automatisk, når
// man selv åbner den pågældende sag (se App.jsx: OrderRoute).
function NotifGroup({ title, icon: Icon, color, items, onOpen }) {
  if (items.length === 0) return null;
  return (
    <div className="p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color }}>
        <Icon size={13} className="shrink-0" /> {title}
      </p>
      <div className="space-y-0.5">
        {items.map((o) => (
          <button key={o.id} onClick={() => onOpen(o.id)} className="w-full text-left rounded-lg hover:bg-panel px-2 py-1.5 flex items-center justify-between gap-2 transition-colors">
            <span className="text-xs text-ink truncate">{o.kunde?.navn || "Ukendt kunde"}</span>
            <span className="font-mono text-[10px] text-muted shrink-0">#{o.nr}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function NotificationBell({ notifications, onOpenOrder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const { materialer = [], problemer = [], opfoelgninger = [] } = notifications || {};
  const total = materialer.length + problemer.length + opfoelgninger.length;

  const openAndClose = (id) => { setOpen(false); onOpenOrder(id); };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-lg bg-black border border-[#333] flex items-center justify-center text-[#C9C9C9] hover:text-white hover:border-brand transition-colors"
        title="Notifikationer"
      >
        <Bell size={16} />
        {total > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-lg bg-brand text-white text-[10px] font-bold flex items-center justify-center">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white rounded-lg border border-line shadow-lg z-30 text-left">
          {total === 0 ? (
            <p className="p-4 text-sm text-muted text-center">Ingen nye notifikationer på dine sager.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-divider">
              <NotifGroup title={`${problemer.length} ${problemer.length === 1 ? "sag" : "sager"} kom ikke i mål`} icon={AlertTriangle} color="#B3261E" items={problemer} onOpen={openAndClose} />
              <NotifGroup title={`${materialer.length} ${materialer.length === 1 ? "sag har" : "sager har"} nyt materialeforbrug`} icon={Package} color="#C8232E" items={materialer} onOpen={openAndClose} />
              <NotifGroup title={`${opfoelgninger.length} ${opfoelgninger.length === 1 ? "sag har" : "sager har"} fået en opfølgning`} icon={Copy} color="#52697E" items={opfoelgninger} onOpen={openAndClose} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopNav({ page, onChange, user, onLogOut, notifications, onOpenOrder }) {
  const allowed = PAGES.filter((s) => (PAGES_FOR_ROLE[user.rolle] || []).includes(s.key) || (s.key === "systemadmin" && user.erSystemadmin));
  return (
    <div className="sticky top-0 z-20 bg-ink mb-6">
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
                className={`flex items-center gap-1.5 px-3.5 py-2 shrink-0 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  active ? "bg-white text-ink" : "bg-transparent text-[#C9C9C9] hover:text-white"
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
          {notifications && onOpenOrder && <NotificationBell notifications={notifications} onOpenOrder={onOpenOrder} />}
          <button
            onClick={onLogOut}
            className="w-10 h-10 rounded-lg bg-black border border-[#333] flex items-center justify-center text-brand hover:border-brand transition-colors"
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
