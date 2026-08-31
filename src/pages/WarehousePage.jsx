import React, { useState } from "react";
import { Check, KeyRound, AlertTriangle, Lock, RotateCw, X } from "lucide-react";
import { lineItemLabel, formatLongDate, canDo, isMissingActive } from "../data/domain";
import { DateSelector } from "../components/common";

// Lagersiden viser ét pluk-PUNKT pr. varelinje - IKKE ét punkt pr. ordre.
// En ordre med 3 varelinjer giver altså 3 selvstændige rækker her, som hver
// kan afkrydses uafhængigt af hinanden (fx "køleskabet er hentet, men
// vaskemaskinen mangler stadig"). Se onToggleLineItemPicked i App.jsx, som
// også opdaterer ordrens samlede plukket-flag, når ALLE dens varelinjer er
// plukket.
//
// En ordre er kun "plukkeklar" (dvs. vises overhovedet her) hvis den reelt
// kan køres ud: den skal have en montør tildelt, OG den montørs
// nuværende bil skal være i drift (ikke lukket/på værksted). Er en af
// delene ikke opfyldt, giver det ikke mening at bede lageret plukke varen
// endnu - den kan jo ikke leveres. Sagen dukker i stedet op i
// Planlægning under "Kræver handling", hvor det reelle problem (ingen
// montør/bil) skal løses først. Eksporteres (august 2026) så DashboardPage
// kan genbruge samme regel til "Dagens pluk"-widgeten, i stedet for at
// duplikere den.
function isOrderPickable(order, technicians, vehicles) {
  if (!order.montorId) return false;
  const technician = technicians.find((m) => m.id === order.montorId);
  if (!technician || !technician.bilId) return false;
  const vehicle = vehicles.find((v) => v.id === technician.bilId);
  return !!vehicle && !vehicle.lukket;
}

// "Varen kan ikke findes" (august 2026). Det sker jævnligt, at en vare er
// oversolgt, eller at en leverance ikke er kommet til tiden - og indtil nu
// havde lageret ingen måde at sige det på inde i systemet. Beskeden gik
// mundtligt videre, eller slet ikke, og så kørte montøren forgæves ud til
// kunden.
//
// Noten er valgfri, men foreslås med et par hurtige standardgrunde: står
// man på lageret med telefonen i hånden, skal det tage sekunder, ikke et
// minut. Sælgeren, der har booket sagen, får besked med det samme.
const HURTIGE_GRUNDE = ["Ikke på lager (oversolgt)", "Leverance forsinket", "Beskadiget ved modtagelse", "Forkert model leveret"];

function ReportMissingDialog({ order, lineItem, onConfirm, onCancel }) {
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-3" role="dialog" aria-modal="true" aria-label="Meld varen manglende">
      <div className="w-full sm:max-w-md rounded-xl bg-white border border-line shadow-lg p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">Varen kan ikke findes</h2>
          <button onClick={onCancel} aria-label="Annuller" className="w-9 h-9 -m-1 flex items-center justify-center rounded-lg text-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-ink font-semibold">{lineItemLabel(lineItem)}</p>
        <p className="text-xs text-muted mb-3">{order.kunde?.navn} · sag #{order.nr}</p>

        <p className="text-xs text-muted mb-1.5">Hvorfor kan den ikke findes?</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {HURTIGE_GRUNDE.map((g) => (
            <button
              key={g}
              onClick={() => setNote(g)}
              className={`px-3 py-2 rounded-lg text-xs border transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${note === g ? "border-brand text-brand font-semibold" : "border-line text-muted hover:border-brand"}`}
            >
              {g}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          aria-label="Begrundelse"
          placeholder="Skriv evt. mere her..."
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand resize-none"
        />

        <p className="text-[11px] text-muted mt-2">
          Sælgeren, der har booket sagen, får besked med det samme. Beskeden bliver stående, indtil sagen får en ny dato, varen bliver skiftet ud, eller du fjerner markeringen igen.
        </p>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onConfirm(note)}
            className="flex-1 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-danger hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink transition-colors"
          >
            Meld manglende
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors"
          >
            Fortryd
          </button>
        </div>
      </div>
    </div>
  );
}

function WarehousePage({ orders, technicians, vehicles, selectedDate, onDateChange, onToggleLineItemPicked, onReportMissingItem, onClearMissingItem, onOpen, permissions }) {
  const canPick = canDo(permissions, "sag_pluk") || canDo(permissions, "sag_feltarbejde");
  const [reporting, setReporting] = useState(null); // { order, lineItem }

  const todaysOrders = orders.filter((s) => s.dato === selectedDate);
  const pickableOrders = todaysOrders.filter((o) => isOrderPickable(o, technicians, vehicles));
  const hiddenCount = todaysOrders.length - pickableOrders.length;

  // Flad liste af { order, lineItem } - ét element pr. varelinje på tværs
  // af dagens plukkeklare ordrer.
  const points = pickableOrders.flatMap((order) => (order.varelinjer || []).map((lineItem) => ({ order, lineItem })));
  const sortFn = (a, b) => (a.order.start || "").localeCompare(b.order.start || "");

  // Manglende varer får deres EGEN sektion øverst. De hører ikke hjemme
  // under "mangler pluk", for der er intet at plukke - og de må slet ikke
  // gemme sig blandt de øvrige, når hele pointen er, at nogen skal handle
  // på dem.
  const missingItems = points.filter((p) => isMissingActive(p.order, p.lineItem)).sort(sortFn);
  const toPick = points.filter((p) => !p.lineItem.plukket && !isMissingActive(p.order, p.lineItem)).sort(sortFn);
  const ready = points.filter((p) => p.lineItem.plukket && !isMissingActive(p.order, p.lineItem)).sort(sortFn);

  const Row = ({ order, lineItem, variant }) => {
    const technician = technicians.find((m) => m.id === order.montorId);
    const erManglende = variant === "mangler";
    return (
      <div className={`rounded-xl bg-white border shadow-sm p-3 ${erManglende ? "border-danger" : "border-[#ECECEC]"}`}>
        <div className="flex items-center gap-3">
          {erManglende ? (
            <AlertTriangle size={22} className="shrink-0 text-danger" aria-hidden="true" />
          ) : (
            <button
              onClick={() => canPick && onToggleLineItemPicked(order.id, lineItem.id)}
              disabled={!canPick}
              aria-label={lineItem.plukket ? `Marker ${lineItemLabel(lineItem)} som ikke plukket` : `Marker ${lineItemLabel(lineItem)} som plukket`}
              className={`w-8 h-8 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${lineItem.plukket ? "border-success bg-success" : "border-line bg-white"} ${!canPick ? "opacity-50 cursor-not-allowed" : ""}`}
              title={!canPick ? "Du har ikke rettighed til at afkrydse pluk" : lineItem.plukket ? "Marker som ikke plukket" : "Marker som plukket"}
            >
              {lineItem.plukket ? <Check size={16} color="white" strokeWidth={3} aria-hidden="true" /> : (!canPick && <Lock size={12} className="text-muted" aria-hidden="true" />)}
            </button>
          )}
          <button type="button" onClick={() => onOpen(order.id)} className="min-w-0 flex-1 text-left focus:outline-none focus:ring-2 focus:ring-brand rounded">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-ink truncate">{lineItemLabel(lineItem)}</p>
              <span className="font-mono text-[10px] text-faint">#{order.nr}</span>
              {order.noegle?.kraeves && <KeyRound size={12} className="text-brand shrink-0" aria-label="Nøgle/adgang kræves" />}
            </div>
            <p className="text-xs text-muted truncate">{order.kunde.navn} · {order.start}–{order.slut}{technician ? ` · ${technician.navn}` : ""}</p>
          </button>

          {/* "Kan ikke findes" ligger som en lille knap på hver linje, der
              endnu ikke er plukket. Bevidst ikke gemt i en menu: det er en
              handling, man udfører stående ved reolen med en telefon i den
              ene hånd. */}
          {!erManglende && canPick && onReportMissingItem && !lineItem.plukket && (
            <button
              onClick={() => setReporting({ order, lineItem })}
              aria-label={`Meld ${lineItemLabel(lineItem)} som ikke fundet`}
              title="Varen kan ikke findes"
              className="shrink-0 w-11 h-11 -my-1 flex items-center justify-center rounded-lg text-muted hover:text-danger border border-line hover:border-danger focus:outline-none focus:ring-2 focus:ring-danger transition-colors"
            >
              <AlertTriangle size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {erManglende && (
          <div className="mt-2 pl-1">
            <p className="text-xs text-danger">{lineItem.mangler?.note}</p>
            <p className="text-[11px] text-muted mt-0.5">
              Meldt {lineItem.mangler?.tid}{lineItem.mangler?.meldtAf?.navn ? ` af ${lineItem.mangler.meldtAf.navn}` : ""} · sælgeren er underrettet
            </p>
            {canPick && onClearMissingItem && (
              <button
                onClick={() => onClearMissingItem(order.id, lineItem.id)}
                className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:text-success hover:border-success focus:outline-none focus:ring-2 focus:ring-success transition-colors"
              >
                <RotateCw size={13} aria-hidden="true" /> Varen er fundet alligevel
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">{formatLongDate(selectedDate)}</p>
      <h1 className="font-display text-4xl uppercase tracking-tight text-ink mb-1">Lager & ordrepluk</h1>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <p className="text-sm text-muted">{toPick.length} varer mangler at blive plukket · {ready.length} klar til afhentning</p>
        <DateSelector date={selectedDate} onChange={onDateChange} />
      </div>
      {!canPick && (
        <p className="text-xs text-muted italic mb-4 flex items-center gap-1.5"><Lock size={12} className="shrink-0" aria-hidden="true" /> Du kan se pluklisten, men ikke afkrydse punkter — du mangler rettigheden "Afkrydse plukket".</p>
      )}
      {hiddenCount > 0 && (
        <p className="text-xs text-muted italic mb-4 flex items-center gap-1.5">
          <AlertTriangle size={12} className="shrink-0" aria-hidden="true" /> {hiddenCount} {hiddenCount === 1 ? "sag er" : "sager er"} skjult her, fordi den mangler montør eller montørens bil er ude af drift — se Planlægning under "Kræver handling".
        </p>
      )}

      {missingItems.length > 0 && (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-danger mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-danger" /> Kan ikke findes ({missingItems.length})
          </h2>
          <div className="space-y-2 mb-8">
            {missingItems.map((p) => <Row key={p.lineItem.id} order={p.order} lineItem={p.lineItem} variant="mangler" />)}
          </div>
        </>
      )}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-brand" /> Mangler pluk ({toPick.length})
      </h2>
      {toPick.length === 0 ? <p className="text-sm text-muted italic mb-8">Alt er plukket til denne dags ture.</p> : <div className="space-y-2 mb-8">{toPick.map((p) => <Row key={p.lineItem.id} order={p.order} lineItem={p.lineItem} />)}</div>}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-success mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-success" /> Klar til afhentning ({ready.length})
      </h2>
      {ready.length === 0 ? <p className="text-sm text-muted italic">Ingen endnu.</p> : <div className="space-y-2">{ready.map((p) => <Row key={p.lineItem.id} order={p.order} lineItem={p.lineItem} />)}</div>}

      {reporting && (
        <ReportMissingDialog
          order={reporting.order}
          lineItem={reporting.lineItem}
          onCancel={() => setReporting(null)}
          onConfirm={(note) => {
            onReportMissingItem(reporting.order.id, reporting.lineItem.id, note);
            setReporting(null);
          }}
        />
      )}
    </div>
  );
}

export { WarehousePage, isOrderPickable };
