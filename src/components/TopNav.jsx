import React, { useEffect, useRef, useState } from "react";
import { LogOut, Bell, Package, AlertTriangle, Copy, Building2, ArrowLeftRight } from "lucide-react";
import { PAGES } from "../data/domain";
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
        <Icon size={13} className="shrink-0" aria-hidden="true" /> {title}
      </p>
      <div className="space-y-0.5">
        {items.map((o) => (
          <button key={o.id} onClick={() => onOpen(o.id)} className="w-full text-left rounded-lg hover:bg-panel px-2 py-2 flex items-center justify-between gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-brand">
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
    // "mousedown" alene lukkede ikke på touch i alle browsere - "touchstart"
    // tilføjet, så en montør på mobil også kan lukke ved at trykke udenfor.
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  // Escape lukker - forventet opførsel for enhver popover, og den eneste
  // vej ud for en tastaturbruger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const { materialer = [], problemer = [], opfoelgninger = [] } = notifications || {};
  const total = materialer.length + problemer.length + opfoelgninger.length;

  const openAndClose = (id) => { setOpen(false); onOpenOrder(id); };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={total > 0 ? `Notifikationer, ${total} nye` : "Notifikationer"}
        className="relative w-10 h-10 rounded-lg bg-black border border-[#333] flex items-center justify-center text-[#C9C9C9] hover:text-white hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors"
        title="Notifikationer"
      >
        <Bell size={16} aria-hidden="true" />
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

// Butiks-visning/-skifter (august 2026): for en almindelig bruger vises
// blot navnet på deres egen butik - rent informativt, intet at klikke på.
// For en SYSTEMADMIN vises i stedet en dropdown med ALLE butikker (samt
// en "Systemadministration"-mulighed for at gå tilbage til butiks-
// oversigten uden nogen valgt butik), så de kan skifte over og se/hjælpe
// en given butiks data - uden at det ændrer deres egen brugerkonto
// permanent (se App.jsx: activeStoreId, som er ren UI-tilstand, ikke
// gemt på deres profil).
function StoreSwitcher({ store, isSystemAdmin, allStores, onSwitchStore, onExitStoreView }) {
  if (isSystemAdmin) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <Building2 size={13} className="text-[#C9C9C9] hidden sm:inline" aria-hidden="true" />
        <select
          value={store?.id || ""}
          onChange={(e) => e.target.value && onSwitchStore(e.target.value)}
          aria-label="Skift butik"
          className="bg-black border border-[#333] text-[#C9C9C9] text-xs rounded-lg px-2 py-2 max-w-[100px] sm:max-w-[140px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand"
          title="Skift butik"
        >
          {!store && <option value="">Vælg butik...</option>}
          {(allStores || []).map((s) => <option key={s.id} value={s.id}>{s.navn}</option>)}
        </select>
        {onExitStoreView && (
          <button onClick={onExitStoreView} aria-label="Tilbage til systemadministration" className="w-10 h-10 rounded-lg bg-black border border-[#333] flex items-center justify-center text-[#C9C9C9] hover:text-white hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors shrink-0" title="Tilbage til systemadministration">
            <ArrowLeftRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }
  if (!store) return null;
  return (
    <span className="text-xs text-[#C9C9C9] hidden sm:flex items-center gap-1 shrink-0" title={store.navn}>
      <Building2 size={12} aria-hidden="true" /> {store.navn}
    </span>
  );
}

// RETTET (august 2026, fundet på skærmbillede fra en rigtig telefon):
// toplinjen var ÉN vandret række - logo, fane-knapper og kontroller side
// om side. På en telefon fik fane-området under 150 px at være på, fordi
// logo + butiksvælger + klokke + log ud tog resten. Resultatet var, at
// den aktive fane blev beskåret midt i ordet ("...lægni") og lagde sig
// hen over logoet, og at man hverken kunne se eller nå de øvrige faner.
// Navigationen var altså reelt ubrugelig på mobil.
//
// Løsningen er at give fanerne deres EGEN række på små skærme: logo og
// kontroller i første række, fanerne i fuld bredde nedenunder (stadig
// vandret rulbare, hvis der er mange). På sm og bredere er det uændret
// én række, hvor der er plads. Løst med flex-wrap + order, så knapperne
// kun findes ÉT sted i DOM'en - ikke to udgaver med hidden/visible, som
// ville gentage hele navigationen for en skærmlæser.
function TopNav({ page, onChange, user, onLogOut, notifications, onOpenOrder, allowedPages, store, allStores, onSwitchStore, onExitStoreView }) {
  const allowed = PAGES.filter((s) => allowedPages.includes(s.key) || (s.key === "systemadmin" && user.erSystemadmin));
  return (
    <div className="sticky top-0 z-20 bg-ink mb-6">
      <nav aria-label="Hovedmenu" className="max-w-6xl mx-auto flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="shrink-0 flex items-center pr-1 order-1">
          <img src={PUNKT1_LOGO_NEGATIV} alt="Punkt1" className="h-7 w-auto" />
        </div>

        {/* Kontroller: order-2 på mobil (samme række som logoet, skubbet
            helt til højre), order-3 på pc (efter fanerne). */}
        <div className="flex items-center gap-2 shrink-0 ml-auto order-2 sm:order-3 sm:ml-0">
          <StoreSwitcher store={store} isSystemAdmin={user.erSystemadmin} allStores={allStores} onSwitchStore={onSwitchStore} onExitStoreView={onExitStoreView} />
          <span className="text-xs text-[#C9C9C9] hidden sm:inline pr-1">{user.navn}</span>
          {notifications && onOpenOrder && <NotificationBell notifications={notifications} onOpenOrder={onOpenOrder} />}
          <button
            onClick={onLogOut}
            aria-label="Log ud"
            className="w-10 h-10 rounded-lg bg-black border border-[#333] flex items-center justify-center text-brand hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors"
            title="Log ud"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Faner: w-full på mobil = egen række under logoet. På sm og
            bredere flex-1 i samme række. min-w-0 er nødvendig, for at et
            flex-barn overhovedet MÅ blive smallere end sit indhold - uden
            den ville overflow-x-auto aldrig træde i kraft, og indholdet
            ville skubbe naboerne ud i stedet for at rulle. */}
        <div className="w-full sm:w-auto sm:flex-1 min-w-0 overflow-x-auto flex gap-1.5 py-0.5 order-3 sm:order-2">
          {allowed.map((s) => {
            const Icon = s.icon;
            const active = page === s.key;
            return (
              <button
                key={s.key}
                onClick={() => onChange(s.key)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 px-3.5 py-2 shrink-0 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${
                  active ? "bg-white text-ink" : "bg-transparent text-[#C9C9C9] hover:text-white"
                }`}
              >
                <Icon size={15} strokeWidth={2.5} aria-hidden="true" />
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export { TopNav };
