import React, { useMemo, useState } from "react";
import { Settings2, Plus, ChevronUp, ChevronDown, Upload, AlertTriangle, Truck } from "lucide-react";
import { todayISO, dailyOrderCompare, canDo, DASHBOARD_WIDGET_CATALOG, missingLineItems, lineItemLabel } from "../data/domain";
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
// Widget-valget (hvilke, og i hvilken rækkefølge) er en ren visnings-
// præference pr. bruger (profiles.dashboard_widgets) - se App.jsx og
// dataStore.js: updateDashboardWidgets. Ingen adgang gives eller fjernes
// ved at tilpasse dette - kun hvad man selv vælger at se først.
// ---------------------------------------------------------------------------

function WidgetCard({ title, icon: Icon, onTitleClick, children }) {
  return (
    <div className="rounded-xl border border-line bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-divider flex items-center gap-2">
        <Icon size={15} className="text-brand shrink-0" aria-hidden="true" />
        {onTitleClick ? (
          <button onClick={onTitleClick} className="text-sm font-semibold uppercase tracking-wide text-ink hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded transition-colors text-left">{title}</button>
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

function TodayRouteWidget({ orders, technicians, profile, onOpen, onNavigate }) {
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
          {shown.map((o) => <OrderCardCompact key={o.id} order={o} technicians={technicians} onOpen={onOpen} minimal />)}
          {myOrders.length > shown.length && (
            <button onClick={() => onNavigate("montor")} className="text-xs font-semibold uppercase tracking-wide text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1">+ {myOrders.length - shown.length} flere i dag</button>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

function PickListWidget({ orders, technicians, vehicles, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "pick_list");
  const today = todayISO();
  const { missing, ready, kanIkkeFindes } = useMemo(() => {
    const todaysOrders = orders.filter((s) => s.dato === today);
    const pickable = todaysOrders.filter((o) => isOrderPickable(o, technicians, vehicles));
    const points = pickable.flatMap((order) => (order.varelinjer || []).map((lineItem) => ({ order, lineItem })));
    const manglende = pickable.reduce((sum, o) => sum + missingLineItems(o).length, 0);
    return {
      missing: points.filter((p) => !p.lineItem.plukket && !p.lineItem.mangler?.note),
      ready: points.filter((p) => p.lineItem.plukket),
      kanIkkeFindes: manglende,
    };
  }, [orders, technicians, vehicles, today]);
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("lager")}>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Mangler pluk" value={missing.length} color="#E2621B" />
        <Stat label="Klar" value={ready.length} color="#3D7A5C" />
      </div>
      {kanIkkeFindes > 0 && (
        <p className="text-xs text-danger mt-2 flex items-center gap-1.5">
          <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
          {kanIkkeFindes} {kanIkkeFindes === 1 ? "vare kan" : "varer kan"} ikke findes
        </p>
      )}
    </WidgetCard>
  );
}

// SALGSFUNKTIONERNE PÅ FORSIDEN (september 2026). Tidligere var dette et
// enkelt genvejskort til Salg-fanen. Nu er det de faktiske indgange til at
// oprette arbejde - knapper, der fører direkte ind i oprettelsesformularen
// og i CSV-importen.
//
// Grunden til at de hører hjemme HER og ikke på en fane for sig: at
// oprette en sag er en HANDLING, man foretager et par gange om dagen, ikke
// et sted man opholder sig. En hel fane til to knapper og en formular gav
// et navigationspunkt, folk skulle igennem for at komme videre.
function QuickBookingWidget({ onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "quick_booking");
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon}>
      <div className="space-y-2">
        <button
          onClick={() => onNavigate("salg")}
          className="w-full rounded-lg bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors py-4 flex flex-col items-center justify-center gap-1.5 text-white"
        >
          <Plus size={20} aria-hidden="true" />
          <span className="text-sm font-semibold uppercase tracking-wide">Opret ny sag</span>
        </button>
        <button
          onClick={() => onNavigate("salg")}
          className="w-full rounded-lg border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors py-2.5 flex items-center justify-center gap-2 text-muted"
        >
          <Upload size={15} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wide">Importér fra fil</span>
        </button>
      </div>
    </WidgetCard>
  );
}

// ÆNDRET (september 2026): FORSIDEN SPEJLER IKKE LÆNGERE KLOKKEN.
//
// De to steder svarede tidligere på det samme spørgsmål, og så bliver det
// ene overflødigt. Nu har de hver deres:
//
//   KLOKKEN  = "der er sket noget på mine sager" - alt, også det rent
//              informative (materialeforbrug tilføjet, opfølgning
//              oprettet). Man kigger, når man har tid.
//   FORSIDEN = "hvad skal jeg gøre nu" - kun det, der kræver en HANDLING
//              af mig, og hvor det koster noget at lade være.
//
// Derfor vises kun to ting her: en vare, lageret ikke kan finde (kunden
// risikerer et forgæves montørbesøg, hvis ingen ringer), og en sag, der
// ikke kom i mål (skal genplanlægges). Materialeforbrug og opfølgninger
// er noteringer, ikke opgaver - de bliver i klokken, og der står
// eksplicit, at de er der, så man ikke tror, forsiden viser alt.
function NotificationsWidget({ notifications, onOpen }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "notifications");
  const { materialer = [], problemer = [], opfoelgninger = [], manglendeVarer = [] } = notifications || {};
  const kunIKlokken = materialer.length + opfoelgninger.length;

  const handlingskraevende = [
    ...manglendeVarer.map((o) => ({
      o,
      label: missingLineItems(o).map((v) => lineItemLabel(v)).join(", ") || "vare mangler",
      prefix: "Mangler:",
      color: "#B3261E",
      icon: Truck,
    })),
    ...problemer.map((o) => ({ o, label: "kom ikke i mål", prefix: "", color: "#8B5E3C", icon: AlertTriangle })),
  ];

  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon}>
      {handlingskraevende.length === 0 ? (
        <p className="text-sm text-success italic">Ingen af dine sager kræver en handling lige nu.</p>
      ) : (
        <div className="space-y-1.5">
          {handlingskraevende.slice(0, 5).map(({ o, label, prefix, color, icon: Icon }) => (
            <button
              key={`${o.id}-${prefix}`}
              onClick={() => onOpen(o.id)}
              className="w-full text-left rounded-lg hover:bg-panel px-2 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold truncate" style={{ color }}>
                  <Icon size={11} className="inline mr-1 -mt-0.5" aria-hidden="true" />
                  {o.kunde?.navn || "Ukendt kunde"}
                </span>
                <span className="font-mono text-[10px] text-muted shrink-0">#{o.nr}</span>
              </span>
              <span className="block text-[11px] text-muted truncate">{prefix} {label}</span>
            </button>
          ))}
          {handlingskraevende.length > 5 && (
            <p className="text-[11px] text-muted px-2">+ {handlingskraevende.length - 5} mere — se klokken øverst.</p>
          )}
        </div>
      )}
      {kunIKlokken > 0 && (
        <p className="text-[11px] text-muted mt-3 pt-2 border-t border-divider">
          {kunIKlokken} {kunIKlokken === 1 ? "besked" : "beskeder"} til orientering (materialeforbrug, opfølgninger) ligger i klokken øverst.
        </p>
      )}
    </WidgetCard>
  );
}

function UpcomingTodayWidget({ orders, technicians, onOpen, onNavigate }) {
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
          {shown.map((o) => <OrderCardCompact key={o.id} order={o} technicians={technicians} onOpen={onOpen} minimal />)}
          {todaysOrders.length > shown.length && (
            <button onClick={() => onNavigate("planlaegning")} className="text-xs font-semibold uppercase tracking-wide text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1">+ {todaysOrders.length - shown.length} flere i dag</button>
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
// dem til-/fravælges, og de AKTIVE kan omrokeres med op/ned. Gemmes med
// det samme ved hver ændring.
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
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Flyt ${entry.label} op`} className="p-1.5 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-brand"><ChevronUp size={13} aria-hidden="true" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === activeKeys.length - 1} aria-label={`Flyt ${entry.label} ned`} className="p-1.5 rounded text-muted hover:text-brand disabled:opacity-20 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-brand"><ChevronDown size={13} aria-hidden="true" /></button>
                  </div>
                  <Icon size={14} className="text-brand shrink-0" aria-hidden="true" />
                  <span className="text-sm text-ink flex-1">{entry.label}</span>
                  <button onClick={() => toggle(key)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger rounded px-2 py-1.5 shrink-0">Fjern</button>
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
                <button key={key} onClick={() => toggle(key)} className="text-xs px-2.5 py-2 rounded-lg border border-line text-muted hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5">
                  <Icon size={13} aria-hidden="true" /> {entry.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardPage({ profile, permissions, orders, technicians, vehicles, timeOff, store, notifications, onOpen, onNavigate, dashboardWidgets, onUpdateWidgets }) {
  const [customizing, setCustomizing] = useState(false);

  const availableCatalog = DASHBOARD_WIDGET_CATALOG.filter((w) => canDo(permissions, w.requires));
  const activeKeys = dashboardWidgets.filter((k) => availableCatalog.some((w) => w.key === k));

  const widgetProps = { orders, technicians, vehicles, timeOff, store, profile, notifications, onOpen, onNavigate };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Forside</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">Hej, {profile.navn?.split(" ")[0] || "der"}</h1>
        </div>
        <button onClick={() => setCustomizing((v) => !v)} aria-expanded={customizing} className="px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5">
          <Settings2 size={15} aria-hidden="true" /> {customizing ? "Færdig" : "Tilpas"}
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
