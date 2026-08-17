import React from "react";
import { RefreshCw, Truck, KeyRound, Clock, Navigation, Phone, MessageSquare, Check, Loader2 } from "lucide-react";
import { buildTitle, isToday, formatLongDate, formatDuration, technicianColor, keyAccessText, orderExpectedMinutes, totalMinutes, STATUS_META, lineItemLabel } from "../data/domain";
import { StatusBadge, LineItemPills, DateSelector } from "../components/common";
import { sendArrivalSms } from "../lib/dataStore";

// Universelt Google Maps-link: åbner Google Maps-appen hvis den er
// installeret (iOS og Android), ellers i browseren. Vi bruger søge-linket
// (ikke rute-linket /maps/dir/) bevidst: rute-linket kræver at Maps selv
// kan bestemme brugerens nuværende position som startpunkt, og hænger i en
// evig "indlæser..."-tilstand hvis det ikke lykkes (lokation ikke givet,
// dårligt signal, testet indendørs). Søge-linket viser blot adressen som
// et punkt med det samme uden den afhængighed - montøren trykker selv på
// rutevejledning inde i Maps, hvor lokationsadgang beder korrekt og
// pålideligt.
const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

// Normaliseret til rent cifre + evt. indledende "+" så tel:-links virker
// uanset om nummeret er skrevet med mellemrum ("12 34 56 78") i kundekortet.
const telHref = (phone) => `tel:${(phone || "").replace(/[^\d+]/g, "")}`;

const ARRIVAL_PRESETS_MIN = [5, 10, 15, 30, 60];

// Popover til at vælge "ankomst om X minutter" og sende SMS'en MED DET
// SAMME ved tryk - via en Edge Function der sender fra firmaets fælles
// Twilio-nummer (se dataStore.js: sendArrivalSms). IKKE via montørens egen
// telefon/SMS-app: montøren har typisk sin egen private telefon, og skal
// hverken dele sit eget nummer eller selv afsende noget manuelt.
function ArrivalSmsButton({ phone, customerName }) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState({ state: "idle" }); // idle | sending | sent | error
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  // Nulstil "sendt"-kvitteringen efter et par sekunder, og luk popoveren
  // igen, når man åbner den på ny (så en gammel fejl/kvittering ikke
  // hænger ved for altid).
  React.useEffect(() => {
    if (status.state !== "sent") return;
    const t = setTimeout(() => { setStatus({ state: "idle" }); setOpen(false); }, 1600);
    return () => clearTimeout(t);
  }, [status]);

  if (!phone) return null;

  const send = async (minutter) => {
    setStatus({ state: "sending" });
    const result = await sendArrivalSms({ telefon: phone, minutter, kundeNavn: customerName });
    if (result.ok) setStatus({ state: "sent" });
    else setStatus({ state: "error", fejl: result.fejl });
  };

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={status.state === "sending"}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand transition-colors disabled:opacity-60"
        title="Send SMS om forventet ankomst"
      >
        {status.state === "sending" ? <Loader2 size={13} className="animate-spin" /> : status.state === "sent" ? <Check size={13} className="text-success" /> : <MessageSquare size={13} />}
        {status.state === "sent" ? "Sendt" : "SMS"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-line rounded-xl shadow-lg p-2 w-56">
          <p className="text-[11px] uppercase tracking-wide text-muted font-semibold px-1 pb-1.5">Send "ankomst om…" nu</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ARRIVAL_PRESETS_MIN.map((m) => (
              <button
                key={m}
                onClick={() => send(m)}
                disabled={status.state === "sending"}
                className="text-center px-2 py-1.5 rounded-lg text-xs font-mono border border-line hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
              >
                {m} min
              </button>
            ))}
          </div>
          {status.state === "error" && <p className="text-[11px] text-danger mt-1.5">{status.fejl}</p>}
          <p className="text-[10px] text-muted mt-2">Sendes med det samme fra butikkens nummer.</p>
        </div>
      )}
    </div>
  );
}

function TechnicianPicker({ technicians, onSelect }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">Montør-visning</p>
      <h1 className="font-display text-3xl uppercase tracking-tight text-ink mb-6">Vælg montør at se</h1>
      {technicians.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen montører oprettet endnu — opret under fanen "Admin".</p>
      ) : (
        <div className="space-y-2">
          {technicians.map((m) => (
            <button key={m.id} onClick={() => onSelect(m.id)} className="w-full text-left rounded-xl bg-white border border-line hover:border-brand transition-colors p-4 flex items-center gap-3 shadow-sm">
              <Truck size={18} style={{ color: technicianColor(m.id, technicians) }} />
              <div>
                <p className="font-semibold text-ink">{m.navn}</p>
                <p className="text-sm text-muted">{m.bil}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TechnicianRouteView({ orders, technician, selectedDate, onDateChange, onOpen, onCycleStatus, onChangeTechnician, onRefresh, refreshing }) {
  const myOrders = orders.filter((s) => s.montorId === technician.id && s.dato === selectedDate).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const done = myOrders.filter((s) => s.status === "afsluttet").length;

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-brand mb-1">{formatLongDate(selectedDate)}</p>
          <h1 className="font-display text-4xl uppercase tracking-tight text-ink">{isToday(selectedDate) ? "Dagens rute" : "Rute"}</h1>
          <p className="text-sm text-muted mt-1">{technician.navn} · {technician.bil}</p>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted">{myOrders.length} sager · {done} afsluttet</p>
            <DateSelector date={selectedDate} onChange={onDateChange} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="p-2 rounded-lg text-ink border border-line hover:border-brand hover:text-brand transition-colors" title="Opdater">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
          {onChangeTechnician && (
            <button onClick={onChangeTechnician} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted transition-colors">
              Skift montør
            </button>
          )}
        </div>
      </div>

      {myOrders.length === 0 ? (
        <p className="text-sm text-muted italic">Ingen sager booket på din bil denne dag endnu.</p>
      ) : (
        <div className="relative pl-8">
          <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-line" />
          {myOrders.map((s) => (
            <div key={s.id} className="relative mb-4">
              <div className="absolute -left-8 top-5 w-4 h-4 rounded-full border-2 bg-paper" style={{ borderColor: STATUS_META[s.status].color }} />
              <div onClick={() => onOpen(s.id)} className="cursor-pointer rounded-xl bg-white border border-[#ECECEC] shadow-sm hover:shadow-md transition-shadow p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-baseline gap-4 min-w-0">
                    <span className="font-mono text-lg text-muted shrink-0">{s.start}–{s.slut}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{buildTitle(s.varelinjer)}</p>
                      <p className="text-sm text-muted truncate">{s.kunde.navn}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {s.stemplerInd ? (
                      <span className="font-mono text-[11px] text-brand flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" /> stemplet ind
                      </span>
                    ) : totalMinutes(s) > 0 ? (
                      <span className="font-mono text-[11px] text-muted">{formatDuration(totalMinutes(s))}</span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted flex items-center gap-1" title="Forventet tidsforbrug"><Clock size={10} /> {formatDuration(orderExpectedMinutes(s))}</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onCycleStatus(s.id); }}><StatusBadge status={s.status} /></button>
                  </div>
                </div>

                {/* Adresse + telefon, samlet med hurtige handlinger (naviger / ring / sms) */}
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm text-muted">{s.kunde.adresse}</p>
                    <a
                      href={mapsUrl(s.kunde.adresse)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors"
                      title="Åbn adressen i Google Maps"
                    >
                      <Navigation size={13} /> Naviger
                    </a>
                  </div>

                  {s.kunde.telefon && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <a
                        href={telHref(s.kunde.telefon)}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-sm text-muted hover:text-brand transition-colors"
                        title="Ring til kunden"
                      >
                        {s.kunde.telefon}
                      </a>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={telHref(s.kunde.telefon)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors"
                          title="Ring til kunden"
                        >
                          <Phone size={13} /> Ring
                        </a>
                        <ArrivalSmsButton phone={s.kunde.telefon} customerName={s.kunde.navn} />
                      </div>
                    </div>
                  )}
                </div>

                {s.noegle?.kraeves && (
                  <p className="text-xs text-brand mt-2 font-semibold flex items-center gap-1.5"><KeyRound size={13} /> {keyAccessText(s.noegle)}</p>
                )}
                {s.kunde.leveringsnote && <p className="text-xs text-brand mt-1 font-medium">⚠ {s.kunde.leveringsnote}</p>}
                {s.koeber && <p className="text-xs text-muted mt-1">Køber: {s.koeber.navn}</p>}

                {/* Bestilte varer + serviceydelse pr. varelinje, så montøren kan se hvad der er bestilt uden at åbne sagen */}
                {s.varelinjer && s.varelinjer.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-divider space-y-0.5">
                    {s.varelinjer.map((v) => (
                      <p key={v.id} className="text-xs text-ink">
                        <span className="font-medium">{lineItemLabel(v)}</span>
                        {v.primaerYdelse?.navn && <span className="text-muted"> · {v.primaerYdelse.navn}</span>}
                      </p>
                    ))}
                  </div>
                )}
                <div className="mt-2"><LineItemPills order={s} /></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { TechnicianPicker, TechnicianRouteView };
