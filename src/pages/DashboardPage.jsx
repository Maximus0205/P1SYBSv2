import React, { useMemo, useState } from "react";
import { Settings2, Plus, ChevronUp, ChevronDown, Upload, AlertTriangle, Truck, Trash2, ClipboardList, CalendarCheck2, Bell } from "lucide-react";
import { todayISO, dailyOrderCompare, canDo, DASHBOARD_WIDGET_CATALOG, missingLineItems, lineItemLabel, needsPlanning, isMissingActive, formatShortDate, STATUS_META, isTechnicianAbsent, timeSlotById } from "../data/domain";
import { haster, bilFremdrift, plukFremdrift, mineSager, dagensTal, holdForBil, bilNavnUdenHold } from "../lib/forsideTal";
import { erMedhjaelperRolle } from "../data/roller";
import { OrderCardCompact } from "../components/OrderCardCompact";
import { classify } from "./PlanningPage";
import { isOrderPickable } from "./WarehousePage";
import { TrashPanel } from "../components/TrashPanel";
import { BookingOverviewModal } from "../components/BookingOverviewModal";
import { ParkeredeSager } from "../components/ParkeredeSager";
import { linjeSkalPlukkes } from "../lib/ydelser";
import { useNytPluk } from "../hooks/useNytPluk";
import { nytPlukNoegle } from "../lib/nytPlukLogik";

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

function NeedsActionWidget({ orders, technicians, personnel, vehicles, timeOff, store, onNavigate }) {
  const { fravaer, needsPlan, unresolved } = useMemo(
    () => classify(orders, technicians, personnel, vehicles, timeOff, store?.sygemeldingVindueTimer),
    [orders, technicians, personnel, vehicles, timeOff, store?.sygemeldingVindueTimer]
  );
  const total = fravaer.length + needsPlan.length + unresolved.length;
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "needs_action");
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("planlaegning")}>
      {total === 0 ? (
        <p className="text-sm text-success italic">Intet kræver handling lige nu.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Sygemelding / feriefridag" value={fravaer.length} color="rgb(var(--color-brand))" />
          <Stat label="Skal planlægges" value={needsPlan.length} color="#B36B1E" />
          <Stat label="Uafsluttet/fejl" value={unresolved.length} color="#8B5E3C" />
        </div>
      )}
    </WidgetCard>
  );
}

// BIL, IKKE MONTØR (september 2026): "din rute i dag" bestemmes af hvilken
// BIL du kører (profile.bilId), ikke af dit eget id - se MontorRoute i
// App.jsx, som løser præcis samme opgave samme måde. "technicians" her er
// BIL-rækker og bruges kun til at style sagskortene, ikke til selve
// opslaget på "hvad er min rute".
function TodayRouteWidget({ orders, technicians, vehicles, profile, crew, onOpen, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "today_route");
  // En medhjælper har ingen fast bil: bilen er den, vedkommende er sat på i dag (dagens hold). En montør, der i dag er sat som 2. mand på
  // en anden bil, følger også dagens hold (oktober 2026).
  const holdBilId = crew?.helpers?.find((h) => h.personId === profile.id && h.dato === todayISO())?.vehicleId;
  const bilId = holdBilId || (erMedhjaelperRolle(profile.rolle) ? undefined : profile.bilId);
  const ownVehicle = (vehicles || []).find((v) => v.id === bilId);
  if (!ownVehicle) {
    return (
      <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon}>
        <p className="text-sm text-muted italic">{erMedhjaelperRolle(profile.rolle) ? "Du er ikke sat på en bil i dag endnu." : "Din bruger er ikke koblet til en bil endnu."}</p>
      </WidgetCard>
    );
  }
  const today = todayISO();
  const myOrders = orders.filter((o) => o.bilId === ownVehicle.id && o.dato === today).sort(dailyOrderCompare);
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

function PickListWidget({ orders, vehicles, primaryServices, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "pick_list");
  const today = todayISO();
  const { missing, ready, kanIkkeFindes, points } = useMemo(() => {
    const todaysOrders = orders.filter((s) => s.dato === today);
    const pickable = todaysOrders.filter((o) => isOrderPickable(o, vehicles));
    // Linjer uden pluk (fx servicetur, hvor varen er hos kunden) tælles ikke med - se lib/ydelser.js.
    const points = pickable.flatMap((order) => (order.varelinjer || []).map((lineItem) => ({ order, lineItem }))).filter((p) => linjeSkalPlukkes(p.lineItem, primaryServices));
    const manglende = pickable.reduce((sum, o) => sum + missingLineItems(o).filter((v) => linjeSkalPlukkes(v, primaryServices)).length, 0);
    return {
      missing: points.filter((p) => !p.lineItem.plukket && !p.lineItem.mangler?.note),
      ready: points.filter((p) => p.lineItem.plukket),
      kanIkkeFindes: manglende,
      points,
    };
  }, [orders, vehicles, primaryServices, today]);
  // NYT PÅ DAGENS PLUK (oktober 2026): samme regel som på Lager-siden - se hooks/useNytPluk.js.
  const { nye } = useNytPluk(points.map((p) => nytPlukNoegle(p.order.id, p.lineItem.id)), orders.length > 0);
  const nyeAntal = points.filter((p) => !p.lineItem.plukket && !p.lineItem.mangler?.note && nye.has(nytPlukNoegle(p.order.id, p.lineItem.id))).length;
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("lager")}>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Mangler pluk" value={missing.length} color="#E2621B" />
        <Stat label="Klar" value={ready.length} color="#3D7A5C" />
      </div>
      {nyeAntal > 0 && (
        <button
          type="button"
          onClick={() => onNavigate("lager")}
          className="mt-2 w-full text-left text-xs font-semibold text-brand flex items-center gap-1.5 rounded px-1 py-1.5 hover:underline focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <Bell size={12} className="shrink-0" aria-hidden="true" />
          {nyeAntal} {nyeAntal === 1 ? "ny vare" : "nye varer"} på dagens pluk siden sidst
        </button>
      )}
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
//
// PARKEREDE SAGER (oktober 2026): ufærdige bookinger ligger HER, under knapperne, og kun
// for den sælger, der påbegyndte dem - se components/ParkeredeSager.jsx. "Fortsæt" åbner
// bookingformularen præcis, hvor man slap.
function QuickBookingWidget({ onNavigate, store }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "quick_booking");
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon}>
      <div className="space-y-2">
        <button
          onClick={() => onNavigate("salg")}
          className="w-full rounded-lg bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand transition-colors py-4 flex flex-col items-center justify-center gap-1.5 text-white"
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
      <ParkeredeSager storeId={store?.id} onGenoptag={() => onNavigate("salg")} />
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
  const { materialer = [], problemer = [], opfoelgninger = [], manglendeVarer = [], delvise = [] } = notifications || {};
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
    ...delvise.map((o) => ({ o, label: "delvist afsluttet — skal have ny dato", prefix: "", color: "#C8232E", icon: CalendarCheck2 })),
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
            <p className="text-[11px] text-muted px-2">+ {handlingskraevende.length - 5} mere. Se klokken øverst.</p>
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


// ---- Dashboard-kasserne (oktober 2026). Tallene beregnes i lib/forsideTal.js (testet); her er kun visningen.
function Fremdrift({ vaerdi, max, label, farve = "bg-success" }) {
  const pct = max > 0 ? Math.round((vaerdi / max) * 100) : 0;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={vaerdi} aria-label={label} className="h-2 rounded-full bg-panel overflow-hidden">
      <div className={`h-full rounded-full ${farve} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const fristTekst = (dage) => (dage < 0 ? `${-dage} ${-dage === 1 ? "dag" : "dage"} over` : dage === 0 ? "i dag" : dage === 1 ? "i morgen" : `om ${dage} dage`);
const planBil = (o, technicians) => technicians.find((t) => t.id === o.bilId)?.navn;

// "Dagen i tal": et bånd med dagens vigtigste tal. Hvert tal er en knap til den side, tallet hører til.
function DagenITalWidget({ orders, vehicles, primaryServices, permissions, onNavigate }) {
  const idag = todayISO();
  const kanPlan = canDo(permissions, "planlaegning"), kanLager = canDo(permissions, "lager");
  const tal = useMemo(() => {
    let pluk = null;
    if (kanLager) {
      const punkter = orders.filter((o) => o.dato === idag && isOrderPickable(o, vehicles)).flatMap((order) => (order.varelinjer || []).map((lineItem) => ({ order, lineItem }))).filter((p) => linjeSkalPlukkes(p.lineItem, primaryServices));
      pluk = { mangler: punkter.filter((p) => !p.lineItem.plukket && !isMissingActive(p.order, p.lineItem)).length, kanIkkeFindes: punkter.filter((p) => isMissingActive(p.order, p.lineItem)).length };
    }
    return dagensTal({ orders, idag, skalPlanlaegges: needsPlanning, kanPlan, kanLager, pluk });
  }, [orders, vehicles, primaryServices, idag, kanPlan, kanLager]);
  return (
    <section aria-label="Dagen i tal" className="rounded-xl border border-line bg-white shadow-sm p-3 sm:p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {tal.map((t) => {
          const farve = t.advarsel && t.vaerdi > 0 ? "#B3261E" : "rgb(var(--color-brand))";
          const indhold = (
            <>
              <p className="text-3xl font-display leading-none" style={{ color: t.vaerdi > 0 ? farve : "#C9C2AE" }}>{t.vaerdi}{t.af !== undefined && t.af > 0 && <span className="text-base text-muted"> / {t.af}</span>}</p>
              <p className="text-[11px] text-muted uppercase tracking-wide mt-1">{t.label}</p>
            </>
          );
          return t.side ? (
            <button key={t.id} type="button" onClick={() => onNavigate(t.side)} className="rounded-lg bg-panel px-3 py-3 text-left hover:ring-1 hover:ring-brand focus:outline-none focus:ring-2 focus:ring-brand min-h-[44px]">{indhold}</button>
          ) : <div key={t.id} className="rounded-lg bg-panel px-3 py-3">{indhold}</div>;
        })}
      </div>
    </section>
  );
}

// "Bilerne i dag": ét kort pr. bil med fremdrift, næste stop og advarsler.
function BilStatusWidget({ orders, technicians, vehicles, personnel, crew, timeOff, onOpen, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "bil_status");
  const idag = todayISO();
  const biler = useMemo(() => bilFremdrift({ orders, biler: technicians.map((t) => ({ ...t, lukket: (vehicles || []).find((v) => v.id === t.id)?.lukket })), dato: idag, sammenlign: dailyOrderCompare, erManglende: isMissingActive })
    .map((b) => ({ ...b, hold: holdForBil({ bilId: b.bil.id, dato: idag, personnel, helpers: crew?.helpers, erMedhjaelper: erMedhjaelperRolle, fraværende: (id, d) => isTechnicianAbsent(id, d, timeOff) }) })),
  [orders, technicians, vehicles, personnel, crew, timeOff, idag]);
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("planlaegning")}>
      {biler.length === 0 ? <p className="text-sm text-muted italic">Ingen bil har sager i dag.</p> : (
        <ul className="space-y-3">
          {biler.map((b) => (
            <li key={b.bil.id}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-ink truncate">{bilNavnUdenHold(b.bil.navn)}</span>
                <span className="text-xs text-muted shrink-0">{b.faerdige} af {b.total} færdige{b.igang > 0 ? " · 1 i gang" : ""}</span>
              </div>
              <p className="text-xs text-muted mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span><span className="font-semibold text-ink">Montør</span> {b.hold.montoerer.length > 0 ? b.hold.montoerer.join(", ") : <span className="text-danger">ingen i dag</span>}</span>
                {b.hold.andenMand.length > 0 && <span><span className="font-semibold text-ink">2. mand</span> {b.hold.andenMand.join(", ")}</span>}
                {b.hold.fravaer > 0 && <span className="text-danger">{b.hold.fravaer} fraværende</span>}
              </p>
              <Fremdrift vaerdi={b.faerdige} max={b.total} label={`${bilNavnUdenHold(b.bil.navn)}: ${b.faerdige} af ${b.total} sager færdige`} />
              {b.naeste ? (
                <button type="button" onClick={() => onOpen(b.naeste.id)} className="mt-1 w-full text-left text-xs text-muted truncate hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded">
                  Næste: <span className="text-ink font-medium">{`${timeSlotById(b.naeste.tidsrumId).label} · `}{b.naeste.kunde?.navn || "Ukendt kunde"}</span>
                </button>
              ) : <p className="mt-1 text-xs text-success">Alle sager er afsluttet.</p>}
              {(b.problemer > 0 || b.manglende > 0) && (
                <p className="mt-0.5 text-xs text-danger flex items-center gap-1"><AlertTriangle size={11} aria-hidden="true" />{[b.problemer > 0 && `${b.problemer} med problem`, b.manglende > 0 && `${b.manglende} mangler en vare`].filter(Boolean).join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// "Haster": ikke-planlagte sager, der skal være kørt inden for en uge.
function HasterWidget({ orders, onOpen, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "haster");
  const liste = useMemo(() => haster({ orders, idag: todayISO(), skalPlanlaegges: needsPlanning }), [orders]);
  const farve = { overskredet: "#B3261E", snart: "#B36B1E", ok: "#6B6B6B" };
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("planlaegning")}>
      {liste.length === 0 ? <p className="text-sm text-success italic">Ingen uplanlagte sager har frist inden for en uge.</p> : (
        <ul className="space-y-1">
          {liste.slice(0, 6).map((x) => (
            <li key={x.order.id}>
              <button type="button" onClick={() => onOpen(x.order.id)} className="w-full text-left rounded-lg hover:bg-panel px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand min-h-[44px]">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink truncate">{x.order.kunde?.navn || "Ukendt kunde"}</span>
                  <span className="text-[11px] font-semibold shrink-0" style={{ color: farve[x.niveau] }}>{fristTekst(x.dage)}</span>
                </span>
                <span className="block text-[11px] text-muted truncate">#{x.order.nr} · {x.order.senestDato ? "senest " : ""}{formatShortDate(x.dato)}</span>
              </button>
            </li>
          ))}
          {liste.length > 6 && <li><button type="button" onClick={() => onNavigate("planlaegning")} className="text-xs font-semibold uppercase tracking-wide text-brand hover:underline px-2 min-h-[44px]">Se alle {liste.length}</button></li>}
        </ul>
      )}
    </WidgetCard>
  );
}

// "Mine sager": sælgerens egne åbne sager - hvad venter på en dato, og hvad er planlagt.
function MineSagerWidget({ orders, technicians, profile, onOpen }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "mine_sager");
  const m = useMemo(() => mineSager({ orders, profilId: profile.id, skalPlanlaegges: needsPlanning }), [orders, profile.id]);
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon}>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="Venter på dato" value={m.venter.length} color="#B36B1E" />
        <Stat label="Planlagt" value={m.planlagte.length} color="#52697E" />
      </div>
      {m.alle === 0 ? <p className="text-sm text-muted italic">Du har ingen åbne sager lige nu.</p> : (
        <ul className="space-y-1">
          {m.planlagte.slice(0, 5).map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => onOpen(o.id)} className="w-full text-left rounded-lg hover:bg-panel px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand min-h-[44px]">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink truncate">{o.kunde?.navn || "Ukendt kunde"}</span>
                  <span className="text-[11px] text-muted shrink-0">{o.dato ? formatShortDate(o.dato) : ""}</span>
                </span>
                <span className="block text-[11px] text-muted truncate">#{o.nr} · {STATUS_META[o.status]?.label || o.status}{planBil(o, technicians) ? ` · ${planBil(o, technicians)}` : ""}{(o.varelinjer || []).some((l) => isMissingActive(o, l)) ? " · vare mangler" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// "Pluk pr. bil": fremdrift i pluk for hver bil i dag.
function PlukBilerWidget({ orders, vehicles, primaryServices, technicians, onNavigate }) {
  const catalogEntry = DASHBOARD_WIDGET_CATALOG.find((w) => w.key === "pluk_biler");
  const liste = useMemo(() => {
    const idag = todayISO();
    const bilerMedNavn = (vehicles || []).map((v) => ({ ...v, navn: technicians.find((t) => t.id === v.id)?.navn || v.navn }));
    const points = orders.filter((o) => o.dato === idag && isOrderPickable(o, vehicles)).flatMap((order) => (order.varelinjer || []).map((lineItem) => ({ order, lineItem }))).filter((p) => linjeSkalPlukkes(p.lineItem, primaryServices));
    return plukFremdrift({ orders, points, vehicles: bilerMedNavn, dato: idag, sammenlign: dailyOrderCompare, erManglende: isMissingActive });
  }, [orders, vehicles, primaryServices, technicians]);
  return (
    <WidgetCard title={catalogEntry.label} icon={catalogEntry.icon} onTitleClick={() => onNavigate("lager")}>
      {liste.length === 0 ? <p className="text-sm text-muted italic">Intet at plukke til i dag.</p> : (
        <ul className="space-y-3">
          {liste.map((b) => (
            <li key={b.bil.id}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-ink truncate">{b.bil.navn || b.bil.id}</span>
                <span className="text-xs text-muted shrink-0">{b.plukket} af {b.linjer} varer plukket</span>
              </div>
              <Fremdrift vaerdi={b.plukket} max={b.linjer} label={`${b.bil.navn}: ${b.plukket} af ${b.linjer} varer plukket`} farve={b.plukket === b.linjer ? "bg-success" : "bg-brand"} />
              {b.manglende > 0 && <p className="mt-0.5 text-xs text-danger flex items-center gap-1"><AlertTriangle size={11} aria-hidden="true" />{b.manglende} {b.manglende === 1 ? "vare kan" : "varer kan"} ikke findes</p>}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

const WIDGET_COMPONENTS = {
  dagen_i_tal: DagenITalWidget,
  bil_status: BilStatusWidget,
  haster: HasterWidget,
  mine_sager: MineSagerWidget,
  pluk_biler: PlukBilerWidget,
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
      <button type="button" onClick={() => onSave(null)} className="text-xs font-semibold uppercase tracking-wide text-muted border border-line rounded-lg px-3 min-h-[44px] hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand">Nulstil til standard for min rolle</button>
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

function DashboardPage({ profile, permissions, crew, orders, technicians, personnel, vehicles, primaryServices, timeOff, store, notifications, onOpen, onNavigate, dashboardWidgets, onUpdateWidgets }) {
  const [customizing, setCustomizing] = useState(false);
  // PAPIRKURV (oktober 2026): en knap, ikke en widget - papirkurven vises først, når
  // man trykker, og kun for dem der må slette/gendanne sager (sag_slet).
  const [visPapirkurv, setVisPapirkurv] = useState(false);
  const maaSePapirkurv = canDo(permissions, "sag_slet");
  // BOOKEDE VARER (oktober 2026): en knap, ikke en fane - åbner et vindue. Rettigheden 'bookinger' giver adgang og viser ALLE
  // sælgeres bookinger (sælger-filteret i vinduet indsnævrer efter behov). Som standard har admin, sælger og lager den; andre
  // roller og enkelte brugere kan få den under Admin -> Brugere. permissions === null (systemadmin) = alt.
  const [visBookinger, setVisBookinger] = useState(false);
  const maaSeBookinger = canDo(permissions, "bookinger");

  const availableCatalog = DASHBOARD_WIDGET_CATALOG.filter((w) => canDo(permissions, w.requires));
  const activeKeys = dashboardWidgets.filter((k) => availableCatalog.some((w) => w.key === k));

  const widgetProps = { permissions, orders, technicians, personnel, vehicles, primaryServices, timeOff, store, profile, crew, notifications, onOpen, onNavigate };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div data-rundvisning="forside-top">
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Forside</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">Hej, {profile.navn?.split(" ")[0] || "der"}</h1>
        </div>
        <div className="flex gap-2 flex-wrap" data-rundvisning="forside-knapper">
          {maaSeBookinger && (
            <button onClick={() => setVisBookinger(true)} aria-haspopup="dialog" className="px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5">
              <ClipboardList size={15} aria-hidden="true" /> Bookede varer
            </button>
          )}
          {maaSePapirkurv && (
            <button onClick={() => setVisPapirkurv((v) => !v)} aria-expanded={visPapirkurv} className="px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5">
              <Trash2 size={15} aria-hidden="true" /> Papirkurv
            </button>
          )}
          <button onClick={() => setCustomizing((v) => !v)} aria-expanded={customizing} className="px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5">
            <Settings2 size={15} aria-hidden="true" /> {customizing ? "Færdig" : "Tilpas"}
          </button>
        </div>
      </div>

      {customizing && (
        <CustomizePanel activeKeys={activeKeys} availableCatalog={availableCatalog} onSave={onUpdateWidgets} />
      )}

      {visBookinger && maaSeBookinger && (
        <BookingOverviewModal orders={orders} technicians={technicians} profile={profile} onOpen={onOpen} onClose={() => setVisBookinger(false)} />
      )}

      {visPapirkurv && maaSePapirkurv && <TrashPanel storeId={store?.id} onClose={() => setVisPapirkurv(false)} />}

      {activeKeys.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen widgets valgt endnu. Tryk "Tilpas" for at sætte din forside op.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start" data-rundvisning="forside-kasser">
          {activeKeys.map((key) => {
            const Widget = WIDGET_COMPONENTS[key];
            if (!Widget) return null;
            const bred = availableCatalog.find((w) => w.key === key)?.bred;
            return bred ? <div key={key} className="sm:col-span-2 lg:col-span-3"><Widget {...widgetProps} /></div> : <Widget key={key} {...widgetProps} />;
          })}
        </div>
      )}
    </div>
  );
}

export { DashboardPage };
