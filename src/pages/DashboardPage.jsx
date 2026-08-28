import React, { useMemo, useState } from "react";
import { Settings2, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { todayISO, dailyOrderCompare, canDo, DASHBOARD_WIDGET_CATALOG } from "../data/domain";
import { OrderCardCompact } from "../components/OrderCardCompact";
import { classify } from "./PlanningPage";
import { isOrderPickable } from "./WarehousePage";

// ---------------------------------------------------------------------------
// FORSIDE / DASHBOARD (august 2026): en tilpasselig samling af "widgets" -
// hver widget er en LILLE, opsummerende genbrug af logik der allerede
// findes fuldt udfoldet på sin egen side (Planlægning, Lager, Montør) -
// se classify() (fra PlanningPage.jsx) og isOrderPickable() (fra
// WarehousePage.jsx), som begge er eksporteret specifikt for at kunne
// genbruges her, i stedet for at duplikere forretningsreglerne.
//
// Bevidst IKKE et fuldt genbygget "Hurtig booking"-flow her - selve
// booking-formularen (NewOrderForm/OrderFormFields) er stor og tæt
// koblet til Salg-sidens egen kontekst; her er det et hurtigt genvejskort
// til Salg i stedet.
//
// Widget-valget (hvilke, og i hvilken rækkefølge) er en ren visnings-
// præference pr. bruger (profiles.dashboard_widgets) - se App.jsx og
// dataStore.js: updateDashboardWidgets. Ingen adgang gives eller fjernes
// ved at tilpasse dette - kun hvad man selv vælger at se først.
// ---------------------------------------------------------------------------

function WidgetCard({ title, icon: Icon, onTitleClick, children }) {
  return (
    <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-divider flex items-center gap-2">
        <Icon size={15} className="text-brand shrink-0" />
        {onTitleClick ? (
          <button onClick={onTitleClick} className="text-sm font-semibold uppercase tracking-wide text-ink hover:text-brand transition-colors text-left">{title}</button>
        ) : (
          <span className="text-sm font-semibold uppercase tracking-wide text-ink">{title}</span>
        )}
      </div>
      <div className="p-4 flex-1">{children}</div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg bg-panel px-3 py-2">
      <p className="text-2xl font-display leading-none" style={{ color: value > 0 ? color : "#C9C2AE" }}>{value}</p>
      <p className="text-[11px] text-muted uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function NeedsActionWidget({ orders, technicians, vehicles, timeOff, store, onNavigate }) {
  const { technicianProblem, sickLeave, needsPlan, unresolved } = useMemo(
    () => classify(orders, technicians, vehicles, timeOff, store?.sygemeldingVindueTimer),
    [orders, technicians, vehicles, timeOff, store?.sygemeldingVindueTimer]
  );
  const total = technicianProblem.length + sickLeave.length + needsPlan.length + unresolved.length;
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "needs_action");
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("planlaegning")}>
      {total === 0 ? (
        <p className="text-sm text-success italic">Intet kræver handling lige nu.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Montørproblem" value={technicianProblem.length} color="#B3261E" />
          <Stat label="Sygemelding" value={sickLeave.length} color="#C8232E" />
          <Stat label="Skal planlægges" value={needsPlan.length} color="#B36B1E" />
          <Stat label="Uafsluttet/fejl" value={unresolved.length} color="#8B5E3C" />
        </div>
      )}
    </WidgetCard>
  );
}

function TodayRouteWidget({ orders, technicians, profile, onOpen, onCycleStatus, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "today_route");
  const own = technicians.find((m) => m.id === profile.id);
  if (!own) {
    return (
      <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon}>
        <p className="text-sm text-muted italic">Din bruger er ikke koblet til en montør/bil-profil endnu.</p>
      </WidgetCard>
    );
  }
  const today = todayISO();
  const myOrders = orders.filter((o) => o.montorId === own.id && o.dato === today).sort(dailyOrderCompare);
  const shown = myOrders.slice(0, 4);
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("montor")}>
      {myOrders.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen sager booket på din bil i dag.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((o) => <OrderCardCompact key={o.id} order={o} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} minimal />)}
          {myOrders.length > shown.length && (
            <button onClick={() => onNavigate("montor")} className="text-xs font-semibold uppercase tracking-wide text-brand hover:underline">+ {myOrders.length - shown.length} flere i dag</button>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function PickListWidget({ orders, technicians, vehicles, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "pick_list");
  const today = todayISO();
  const { missing, ready } = useMemo(() => {
    const todaysOrders = orders.filter((s) => s.dato === today);
    const pickable = todaysOrders.filter((o) => isOrderPickable(o, technicians, vehicles));
    const points = pickable.flatMap((order) => (order.varelinjer || []).map((lineItem) => ({ order, lineItem })));
    return { missing: points.filter((p) => !p.lineItem.plukket), ready: points.filter((p) => p.lineItem.plukket) };
  }, [orders, technicians, vehicles, today]);
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("lager")}>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Mangler pluk" value={missing.length} color="#E2621B" />
        <Stat label="Klar" value={ready.length} color="#3D7A5C" />
      </div>
    </WidgetCard>
  );
}

function QuickBookingWidget({ onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "quick_booking");
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon}>
      <button onClick={() => onNavigate("salg")} className="w-full rounded-lg border-2 border-dashed border-line hover:border-brand hover:text-brand transition-colors py-4 flex flex-col items-center justify-center gap-1.5 text-muted">
        <Plus size={20} />
        <span className="text-sm font-semibold uppercase tracking-wide">Ny sag</span>
      </button>
    </WidgetCard>
  );
}

function NotificationsWidget({ notifications, onOpen }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "notifications");
  const { materialer = [], problemer = [], opfoelgninger = [] } = notifications || {};
  const items = [
    ...problemer.map((o) => ({ o, label: "kom ikke i mål", color: "#B3261E" })),
    ...materialer.map((o) => ({ o, label: "nyt materialeforbrug", color: "#C8232E" })),
    ...opfoelgninger.map((o) => ({ o, label: "fået en opfølgning", color: "#52697E" })),
  ];
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon}>
      {items.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen nye notifikationer på dine sager.</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map(({ o, label, color }) => (
            <button key={`${o.id}-${label}`} onClick={() => onOpen(o.id)} className="w-full text-left rounded-lg hover:bg-panel px-2 py-1.5 flex items-center justify-between gap-2 transition-colors">
              <span className="text-xs text-ink truncate"><span style={{ color }} className="font-semibold">{o.kunde?.navn || "Ukendt kunde"}</span> — {label}</span>
              <span className="font-mono text-[10px] text-muted shrink-0">#{o.nr}</span>
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

function UpcomingTodayWidget({ orders, technicians, onOpen, onCycleStatus, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "upcoming_today");
  const today = todayISO();
  const todaysOrders = orders.filter((o) => o.dato === today && o.status !== "afsluttet").sort(dailyOrderCompare);
  const shown = todaysOrders.slice(0, 4);
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("planlaegning")}>
      {todaysOrders.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen sager i dag.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((o) => <OrderCardCompact key={o.id} order={o} technicians={technicians} onOpen={onOpen} onCycleStatus={onCycleStatus} minimal />)}
          {todaysOrders.length > shown.length && (
            <button onClick={() => onNavigate("planlaegning")} className="text-xs font-semibold uppercase tracking-wide text-brand hover:underline">+ {todaysOrders.length - shown.length} flere i dag</button>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

const WIDGET_COMPONENTS = {
  needs_action: NeedsActionWidget,
  today_route: TodayRouteWidget,
  pick_list: PickListWidget,
  quick_booking: QuickBookingWidget,
  notifications: NotificationsWidget,
  upcoming_today: UpcomingTodayWidget,
};

// Tilpas-panelet: viser alle widgets brugeren har rettighed til at bruge
// overhovedet (requires === null, eller den rettighed er opfyldt), lader
// dem til-/fravælges, og de AKTIVE kan omrokeres med op/ned - samme
// mønster som andre til-/fravalgs-lister i appen (se AdminParts.jsx:
// PermissionsEditor). Gemmes med det samme ved hver ændring.
function CustomizePanel({ activeKeys, availableCatalog, onSave }) {
  const inactiveKeys = availableCatalog.map((w) => w.key).filter((k) => !activeKeys.includes(k));

  const toggle = (key) => {
    if (activeKeys.includes(key)) onSave(activeKeys.filter((k) => k !== key));
    else onSave([...activeKeys, key]);
  };
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= activeKeys.length) return;
    const next = [...activeKeys];
    [next[index], next[target]] = [next[target], next[index]];
    onSave(next);
  };

  return (
    <div className="rounded-xl border border-line bg-panel p-4 mb-4 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Vises nu (brug pilene til at omrokere)</p>
        {activeKeys.length === 0 ? (
          <p className="text-xs text-muted italic">Ingen widgets valgt endnu.</p>
        ) : (
          <div className="space-y-1.5">
            {activeKeys.map((key, i) => {
              const entry = availableCatalog.find((w) => w.key === key);
              if (!entry) return null;
              const Icon = entry.icon;
              return (
                <div key={key} className="flex items-center gap-2 bg-white rounded-lg border border-line px-2.5 py-1.5">
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none"><ChevronUp size={13} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === activeKeys.length - 1} className="p-0.5 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none"><ChevronDown size={13} /></button>
                  </div>
                  <Icon size={14} className="text-brand shrink-0" />
                  <span className="text-sm text-ink flex-1">{entry.label}</span>
                  <button onClick={() => toggle(key)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-danger shrink-0">Fjern</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {inactiveKeys.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Tilføj</p>
          <div className="flex flex-wrap gap-1.5">
            {inactiveKeys.map((key) => {
              const entry = availableCatalog.find((w) => w.key === key);
              const Icon = entry.icon;
              return (
                <button key={key} onClick={() => toggle(key)} className="text-xs px-2.5 py-1.5 rounded-lg border border-line text-muted hover:border-brand hover:text-brand transition-colors flex items-center gap-1.5">
                  <Icon size={13} /> {entry.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardPage({ profile, permissions, orders, technicians, vehicles, timeOff, store, notifications, onOpen, onCycleStatus, onNavigate, dashboardWidgets, onUpdateWidgets }) {
  const [customizing, setCustomizing] = useState(false);

  const availableCatalog = DASHBOARD_WIDGET_CATALOG.filter((w) => canDo(permissions, w.requires));
  const activeKeys = dashboardWidgets.filter((k) => availableCatalog.some((w) => w.key === k));

  const widgetProps = { orders, technicians, vehicles, timeOff, store, profile, notifications, onOpen, onCycleStatus, onNavigate };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Forside</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">Hej, {profile.navn?.split(" ")[0] || "der"}</h1>
        </div>
        <button onClick={() => setCustomizing((v) => !v)} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand hover:text-brand transition-colors flex items-center gap-1.5">
          <Settings2 size={15} /> {customizing ? "Færdig" : "Tilpas"}
        </button>
      </div>

      {customizing && (
        <CustomizePanel activeKeys={activeKeys} availableCatalog={availableCatalog} onSave={onUpdateWidgets} />
      )}

      {activeKeys.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen widgets valgt endnu — tryk "Tilpas" for at sætte din forside op.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeKeys.map((key) => {
            const Widget = WIDGET_COMPONENTS[key];
            if (!Widget) return null;
            return <Widget key={key} {...widgetProps} />;
          })}
        </div>
      )}
    </div>
  );
}

export { DashboardPage };
