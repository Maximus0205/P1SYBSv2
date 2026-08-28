import React from "react";
import { RefreshCw, Truck, KeyRound, Clock, Navigation, Phone, MessageSquare, Check, Loader2, AlertTriangle, ChevronUp, ChevronDown, Pencil, Copy, Hash, Package, X, Plus, User, Lock } from "lucide-react";
import { buildTitle, isToday, formatLongDate, formatDuration, technicianColor, keyAccessText, orderExpectedMinutes, totalMinutes, STATUS_META, lineItemLabel, dailyOrderCompare, canDo } from "../data/domain";
import { StatusBadge, DateSelector } from "../components/common";
import { Notes, Photos, Reports, TimeLog, ClockWidget, Signature } from "../components/OrderParts";
import { BookingEditor, DuplicatePanel } from "../components/OrderView";
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

// Op/ned-pile til at ændre BESØGSRÆKKEFØLGEN for dagens rute. Bevidst ikke
// træk-og-slip (drag-and-drop er langt mindre pålideligt på touch, især
// med en scrollende liste bag ved) - to store, nemme knapper virker
// forudsigeligt med tommelfingeren, uanset enhed.
function ReorderButtons({ onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  return (
    <div className="flex flex-col shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className="p-1 rounded-md text-muted hover:text-brand hover:bg-panel disabled:opacity-20 disabled:pointer-events-none transition-colors"
        title="Flyt tidligere i ruten"
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className="p-1 rounded-md text-muted hover:text-brand hover:bg-panel disabled:opacity-20 disabled:pointer-events-none transition-colors"
        title="Flyt senere i ruten"
      >
        <ChevronDown size={16} />
      </button>
    </div>
  );
}

// Ét kort pr. sag i montørens rute. Bevidst opdelt i tydeligt adskilte
// sektioner (header / alerts / kontakt / varelinjer) i stedet for én lang
// stak tekstlinjer - det gør kortet hurtigere at skimme i marken, og
// undgår at samme oplysning (nøgleadgang, varenavn) optræder to gange i
// forskellig form (tekst ét sted, pille et andet).
//
// Tillæg vises som REN TEKST, ikke som farvede "pille/boble"-mærker (se
// TechnicianLineItems længere nede for den fulde begrundelse) - og
// telefonnummeret har fuld tekstkontrast (text-ink), ikke den dæmpede
// muted-farve, siden det er noget du reelt skal handle på, ikke baggrunds-
// information.
function OrderStopCard({ order: s, onOpen, onCycleStatus, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const hasAlerts = Boolean(s.noegle?.kraeves || s.kunde.leveringsnote);

  return (
    <div onClick={() => onOpen(s.id)} className="cursor-pointer rounded-xl bg-white border border-[#ECECEC] shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header: rækkefølge-pile, tid, varighed/status, titel, kunde */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {(onMoveUp || onMoveDown) && <ReorderButtons onMoveUp={onMoveUp} onMoveDown={onMoveDown} canMoveUp={canMoveUp} canMoveDown={canMoveDown} />}
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="font-mono text-lg font-semibold text-ink shrink-0">{s.start}–{s.slut}</span>
              {s.stemplerInd ? (
                <span className="font-mono text-[11px] text-brand flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" /> stemplet ind
                </span>
              ) : (
                <span className="font-mono text-[11px] text-muted flex items-center gap-1 shrink-0" title="Forventet/registreret tidsforbrug">
                  <Clock size={10} /> {formatDuration(totalMinutes(s) > 0 ? totalMinutes(s) : orderExpectedMinutes(s))}
                </span>
              )}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onCycleStatus(s.id); }} className="shrink-0"><StatusBadge status={s.status} /></button>
        </div>
        <p className="font-semibold text-ink truncate mt-1.5">{buildTitle(s.varelinjer)}</p>
        <p className="text-sm text-muted truncate">{s.kunde.navn}{s.koeber && <span className="text-muted"> · køber {s.koeber.navn}</span>}</p>
        {s.problem && (
          <p className="text-xs font-semibold text-danger flex items-center gap-1.5 mt-1"><AlertTriangle size={12} className="shrink-0" /> Markeret: kom ikke i mål</p>
        )}
      </div>

      {/* Samlet alert-boks: nøgleadgang + leveringsnote/ring-før-ankomst ét sted,
          i stedet for spredte linjer der konkurrerer med resten af kortet. */}
      {hasAlerts && (
        <div className="mx-4 mb-3 rounded-lg bg-brand/5 border border-brand/20 px-3 py-2 space-y-1">
          {s.noegle?.kraeves && (
            <p className="text-xs font-semibold text-brand flex items-center gap-1.5"><KeyRound size={13} className="shrink-0" /> {keyAccessText(s.noegle)}</p>
          )}
          {s.kunde.leveringsnote && (
            <p className="text-xs font-semibold text-brand flex items-center gap-1.5"><AlertTriangle size={13} className="shrink-0" /> {s.kunde.leveringsnote}</p>
          )}
        </div>
      )}

      {/* Kontakt: adresse + naviger, telefon + ring/sms - egen let baggrund
          så det visuelt er "handlinger", adskilt fra ren information. */}
      <div className="px-4 py-3 bg-panel/60 border-t border-divider space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-ink truncate min-w-0">{s.kunde.adresse}</p>
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
              className="font-mono text-sm text-ink hover:text-brand transition-colors"
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

      {/* Varelinjer: produkt + service + tillæg som RENE TEKSTLINJER, ikke
          farvede pille/boble-mærker (se begrundelse i TechnicianLineItems). */}
      {s.varelinjer && s.varelinjer.length > 0 && (
        <div className="px-4 py-3 border-t border-divider space-y-2">
          {s.varelinjer.map((v) => (
            <div key={v.id}>
              <p className="text-xs text-ink">
                <span className="font-medium">{lineItemLabel(v)}</span>
                {v.primaerYdelse?.navn && <span className="text-muted"> · {v.primaerYdelse.navn}</span>}
              </p>
              {(v.tillaeg || []).length > 0 && (
                <p className="text-[11px] text-ink mt-0.5">{v.tillaeg.map((y) => y.navn).join(" · ")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TechnicianRouteView({ orders, technician, selectedDate, onDateChange, onOpen, onCycleStatus, onReorder, onChangeTechnician, onRefresh, refreshing }) {
  const myOrders = orders.filter((s) => s.montorId === technician.id && s.dato === selectedDate).sort(dailyOrderCompare);
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
        <>
          {myOrders.length > 1 && onReorder && (
            <p className="text-[11px] text-muted mb-3 flex items-center gap-1.5"><ChevronUp size={11} /><ChevronDown size={11} /> Brug pilene på et kort til at ændre besøgsrækkefølgen.</p>
          )}
          <div className="relative pl-8">
            <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-line" />
            {myOrders.map((s, i) => (
              <div key={s.id} className="relative mb-4">
                <div className="absolute -left-8 top-5 w-4 h-4 rounded-full border-2 bg-paper" style={{ borderColor: STATUS_META[s.status].color }} />
                <OrderStopCard
                  order={s}
                  onOpen={onOpen}
                  onCycleStatus={onCycleStatus}
                  onMoveUp={onReorder ? () => onReorder(technician.id, selectedDate, s.id, -1) : undefined}
                  onMoveDown={onReorder ? () => onReorder(technician.id, selectedDate, s.id, 1) : undefined}
                  canMoveUp={i > 0}
                  canMoveDown={i < myOrders.length - 1}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Montørens egen, FORENKLEDE varelinje-visning. Tillæg er rent INFORMATIVE
// her, ikke noget der skal afkrydses/markeres fuldført - en tillægsydelse
// (fx "Afløbstilslutning") beskriver blot OMFANGET af opgaven på den vare.
// Vises derfor som ALMINDELIG TEKST (ikke farvede pille/boble-mærker - det
// var forvirrende og visuelt støjende at have "bobler" for noget der ikke
// kan trykkes på eller ændres). Fuld tekstkontrast (text-ink), ikke
// dæmpet/anonymt - det er information du reelt skal kende omfanget af.
// Ingen mulighed for at tilføje nye tillæg (det hører til i sælgerens/
// adminens opsætning, ikke i marken - se OrderParts.jsx's LineItemDetails,
// som admin/sælger stadig bruger uændret).
function TechnicianLineItems({ order }) {
  return (
    <div className="rounded-xl bg-white border border-line p-4 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Varer &amp; opgaver</h3>
      <div className="space-y-3">
        {order.varelinjer.map((v, i) => (
          <div key={v.id} className={i < order.varelinjer.length - 1 ? "pb-3 border-b border-divider" : ""}>
            <p className="text-sm font-semibold text-ink">{lineItemLabel(v)}</p>
            {v.primaerYdelse?.navn && <p className="text-xs text-ink">{v.primaerYdelse.navn}</p>}
            {(v.tillaeg || []).length > 0 && (
              <p className="text-xs text-ink mt-0.5">{v.tillaeg.map((y) => y.navn).join(" · ")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Materialeforbrug UD OVER det oprindeligt planlagte - fx "der skulle
// bruges en længere vandslange" opdaget hos kunden. Bevidst en EGEN fane,
// adskilt fra "Noter" (fri tekst) og selve varelinjerne (det der blev
// solgt/booket) - så det senere er let at finde igen, fx til fakturering
// af ekstraforbrug. Kun tilgængelig i montør-visningen indtil videre.
// RETTET (august 2026): onAdd/onRemove kan mangle (ingen sag_feltarbejde)
// - viser da kun listen, uden tilføj-formularen, i stedet for at crashe.
function Materials({ order, onAdd, onRemove }) {
  const [navn, setNavn] = React.useState("");
  const [antal, setAntal] = React.useState(1);
  const materialer = order.materialer || [];

  const submit = () => {
    if (!navn.trim() || !onAdd) return;
    onAdd({ navn, antal });
    setNavn(""); setAntal(1);
  };

  return (
    <div>
      {onAdd ? (
        <div className="flex gap-2 mb-4">
          <input
            value={navn} onChange={(e) => setNavn(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Fx 'Vandslange 3m'"
            className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
          />
          <input
            type="number" min="1" value={antal}
            onChange={(e) => setAntal(e.target.value)}
            className="w-16 rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink text-center focus:outline-none focus:border-brand"
          />
          <button onClick={submit} className="px-3 rounded-lg text-ink border border-line hover:border-brand hover:text-brand transition-colors shrink-0"><Plus size={16} /></button>
        </div>
      ) : (
        <p className="text-xs text-muted italic mb-4 flex items-center gap-1.5"><Lock size={12} className="shrink-0" /> Du kan se, men ikke tilføje, materialeforbrug på denne sag.</p>
      )}
      {materialer.length === 0 ? (
        <p className="text-sm text-muted italic">Intet ekstra materialeforbrug registreret for denne sag.</p>
      ) : (
        <div className="space-y-2">
          {[...materialer].reverse().map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border-l-2 border-brand bg-white px-3 py-2 shadow-sm">
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">{m.antal > 1 ? `${m.antal}× ` : ""}{m.navn}</p>
                <p className="font-mono text-[11px] text-muted mt-0.5">{m.tid}</p>
              </div>
              {onRemove && <button onClick={() => onRemove(m.id)} className="text-muted hover:text-danger shrink-0"><X size={16} /></button>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted mt-3">Til ekstra materiale brugt udover det planlagte, fx en længere slange eller ekstra beslag - til senere brug ved fakturering.</p>
    </div>
  );
}

// Panel til at markere sagen med et PROBLEM - fx kunden var ikke hjemme,
// mangler dele, adgangsproblem. Bevidst UAFHÆNGIG af selve status-
// cyklussen (se markProblem i useOrders.js) - montøren skal ikke tvinges
// til at sætte status til "afsluttet" for at kunne flage et problem, og
// kan lige så vel sætte begge dele samtidig. Sælgeren, der har booket
// sagen, ser markeringen automatisk næste gang de logger ind (se
// notifikationsklokken i TopNav.jsx).
function ProblemPanel({ order, onSubmit, onCancel }) {
  const [note, setNote] = React.useState("");
  return (
    <div className="rounded-xl bg-white border border-danger p-4 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-danger mb-1 flex items-center gap-1.5"><AlertTriangle size={14} /> Marker: kom ikke i mål</h3>
      <p className="text-xs text-muted mb-3">Fx kunden ikke hjemme, mangler dele, adgangsproblem. Sælgeren der har booket sagen ({order.oprettetAf?.navn || "ukendt"}) får automatisk besked om det, næste gang de logger ind.</p>
      <textarea
        autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3}
        placeholder="Kort beskrivelse af hvad der gik galt..."
        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-danger mb-3"
      />
      <div className="flex gap-2">
        <button onClick={() => note.trim() && onSubmit(note)} disabled={!note.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-danger hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
          <Check size={14} /> Gem markering
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted transition-colors flex items-center gap-1.5"><X size={14} /> Annuller</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MONTØR-SPECIFIK SAGSDETALJE (august 2026, opdateret med problem-
// markering + "booket af" + individuelle rettigheder) - bevidst en HELT
// SEPARAT visning fra den delte OrderView.jsx, som bruges af admin/sælger.
// Se TechnicianLineItems for hvorfor tillæg er ren tekst, ikke pille/
// boble-mærker.
//
// Resten af funktionaliteten (redigér booking, dupliker/opfølgning, noter,
// billeder, rapporter, tid, underskrift, materialer) er UÆNDRET og
// genbruger de samme, allerede fungerende komponenter som OrderView.jsx
// bruger. At holde ændringen isoleret til denne fil betyder admin- og
// sælger-visningen er 100% upåvirket.
//
// RETTIGHEDER: montør-rollen får som standard alle sag_*-rettigheder (se
// role_default_permissions i databasen - det svarer til, hvad en montør
// allerede kunne før dette system fandtes), så for de fleste montører
// ændrer intet sig her. Låsningen nedenfor betyder noget for en montør,
// der individuelt har fået frataget en rettighed (se PermissionsEditor i
// AdminParts.jsx).
function TechnicianOrderDetail({ order, technicians, onBack, addNote, addPhoto, addReport, onCycleStatus, onClockIn, onClockOut, onUpdateBooking, onSaveSignature, onDuplicate, onAddMaterial, onRemoveMaterial, onMarkProblem, onClearProblem, permissions }) {
  const [tab, setTab] = React.useState("noter");
  const [editing, setEditing] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);
  const [markingProblem, setMarkingProblem] = React.useState(false);
  const canFieldwork = canDo(permissions, "sag_feltarbejde");
  const canPlan = canDo(permissions, "sag_planlaegning");
  const canEditCustomer = canDo(permissions, "sag_kunde");
  const canCreate = canDo(permissions, "sag_opret");
  const tabs = [
    { key: "noter", label: "Noter", count: order.noter.length },
    { key: "materialer", label: "Materialer", count: (order.materialer || []).length },
    { key: "billeder", label: "Billeder", count: order.billeder.length },
    { key: "rapporter", label: "Rapporter", count: order.rapporter.length },
    { key: "tid", label: "Tid", count: order.logs.length },
    { key: "underskrift", label: "Underskrift", count: order.underskrift ? 1 : 0 },
  ];

  return (
    <div>
      <button onClick={onBack} className="text-sm text-muted hover:text-brand mb-4 flex items-center gap-1">← Tilbage</button>

      {editing ? (
        <BookingEditor order={order} technicians={technicians} permissions={permissions} onCancel={() => setEditing(false)} onSave={(fields) => { onUpdateBooking(fields); setEditing(false); }} />
      ) : duplicating ? (
        <DuplicatePanel order={order} onCancel={() => setDuplicating(false)} onDuplicate={(items) => { onDuplicate?.(items); setDuplicating(false); }} />
      ) : markingProblem ? (
        <ProblemPanel order={order} onCancel={() => setMarkingProblem(false)} onSubmit={(note) => { onMarkProblem?.(note); setMarkingProblem(false); }} />
      ) : (
        <div className="rounded-xl bg-white border border-line p-4 mb-4 shadow-sm">
          {/* Sag + status - INGEN sammenkogt kæmpetitel, kun det du reelt
              skal vide, når du står med sagen foran dig. */}
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <p className="font-mono text-xs text-muted">
              #{order.nr} · {formatLongDate(order.dato)} · {order.start}–{order.slut}
              {order.ordrenummer && <span className="ml-2 inline-flex items-center gap-0.5"><Hash size={10} /> {order.ordrenummer}</span>}
            </p>
            <button onClick={() => canFieldwork && onCycleStatus(order.id)} disabled={!canFieldwork} className="shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"><StatusBadge status={order.status} /></button>
          </div>
          {order.oprettetAf?.navn && (
            <p className="text-xs text-muted mb-1 flex items-center gap-1"><User size={11} className="shrink-0" /> Booket af {order.oprettetAf.navn}</p>
          )}
          <p className="text-lg font-semibold text-ink leading-snug">{order.varelinjer.length} {order.varelinjer.length === 1 ? "vare" : "varer"} til {order.kunde.navn}</p>
          {order.kunde.leveringsnote && (
            <p className="text-sm text-brand font-semibold mt-1.5 flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" /> {order.kunde.leveringsnote}</p>
          )}
          {order.noegle?.kraeves && (
            <p className="text-sm text-brand font-semibold mt-1.5 flex items-center gap-1.5"><KeyRound size={14} className="shrink-0" /> {keyAccessText(order.noegle)}</p>
          )}

          {order.problem && (
            <div className="mt-2.5 rounded-lg bg-danger/10 border border-danger px-3 py-2">
              <p className="text-sm font-semibold text-danger flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" /> Markeret: kom ikke i mål</p>
              <p className="text-xs text-danger mt-0.5">{order.problem.note} · {order.problem.tid}</p>
              {onClearProblem && canFieldwork && <button onClick={onClearProblem} className="text-[11px] text-danger underline hover:no-underline mt-1">Fjern markering</button>}
            </div>
          )}

          {/* Kontakt - flettet ind i samme kort, adskilt med en tynd streg. */}
          <div className="mt-3 pt-3 border-t border-divider space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-ink truncate min-w-0">{order.kunde.adresse}</p>
              <a href={mapsUrl(order.kunde.adresse)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors" title="Åbn adressen i Google Maps">
                <Navigation size={13} /> Naviger
              </a>
            </div>
            {order.kunde.telefon && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <a href={telHref(order.kunde.telefon)} className="font-mono text-sm text-ink hover:text-brand transition-colors" title="Ring til kunden">{order.kunde.telefon}</a>
                <div className="flex items-center gap-2">
                  <a href={telHref(order.kunde.telefon)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors" title="Ring til kunden">
                    <Phone size={13} /> Ring
                  </a>
                  <ArrivalSmsButton phone={order.kunde.telefon} customerName={order.kunde.navn} />
                </div>
              </div>
            )}
          </div>

          {/* Sekundære handlinger - lavest visuel vægt, nederst i kortet. */}
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-divider">
            {(canPlan || canEditCustomer) && (
              <button onClick={() => setEditing(true)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand flex items-center gap-1"><Pencil size={13} /> Redigér booking</button>
            )}
            {onDuplicate && canCreate && (
              <button onClick={() => setDuplicating(true)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand flex items-center gap-1"><Copy size={13} /> Dupliker / opfølgning</button>
            )}
            {onMarkProblem && canFieldwork && !order.problem && (
              <button onClick={() => setMarkingProblem(true)} className="text-xs font-semibold uppercase tracking-wide text-danger hover:opacity-80 flex items-center gap-1"><AlertTriangle size={13} /> Marker: kom ikke i mål</button>
            )}
          </div>
        </div>
      )}

      <TechnicianLineItems order={order} />
      <ClockWidget order={order} onClockIn={canFieldwork ? onClockIn : undefined} onClockOut={canFieldwork ? onClockOut : undefined} />

      <div className="flex border-b border-line mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors shrink-0 ${tab === t.key ? "text-ink border-b-2 border-brand" : "text-muted hover:text-ink"}`}>
            {t.label} <span className="font-mono text-xs">({t.count})</span>
          </button>
        ))}
      </div>
      {tab === "noter" && <Notes order={order} onAdd={canFieldwork ? addNote : undefined} />}
      {tab === "materialer" && <Materials order={order} onAdd={canFieldwork ? (m) => onAddMaterial?.(m) : undefined} onRemove={canFieldwork ? (id) => onRemoveMaterial?.(id) : undefined} />}
      {tab === "billeder" && <Photos order={order} onAdd={canFieldwork ? addPhoto : undefined} />}
      {tab === "rapporter" && <Reports order={order} onAdd={canFieldwork ? addReport : undefined} />}
      {tab === "tid" && <TimeLog order={order} />}
      {tab === "underskrift" && <Signature order={order} onSave={canFieldwork ? onSaveSignature : undefined} />}
    </div>
  );
}

export { TechnicianPicker, TechnicianRouteView, TechnicianOrderDetail };
