import React from "react";
import { RefreshCw, Truck, KeyRound, Clock, Navigation, Phone, MessageSquare, Check, Loader2, AlertTriangle, ChevronUp, ChevronDown, Pencil, Copy, Hash, Package, X, Plus, User, Lock, PlayCircle, CheckCheck, Camera } from "lucide-react";
import { buildTitle, isToday, formatLongDate, formatDuration, technicianColor, keyAccessText, orderExpectedMinutes, totalMinutes, STATUS_META, lineItemLabel, dailyOrderCompare, canDo } from "../data/domain";
import { StatusBadge, DateSelector } from "../components/common";
import { Notes, Photos, Reports, TimeLog } from "../components/OrderParts";
import { BookingEditor, DuplicatePanel } from "../components/OrderView";
import { sendArrivalSms } from "../lib/dataStore";

// Universelt Google Maps-link: åbner Google Maps-appen hvis den er
// installeret (iOS og Android), ellers i browseren. Vi bruger søge-linket
// (ikke rute-linket /maps/dir/) bevidst: rute-linket kræver at Maps selv
// kan bestemme brugerens nuværende position som startpunkt, og hænger i en
// evig "indlæser..."-tilstand hvis det ikke lykkes (lokation ikke givet,
// dårligt signal, testet indendørs). Søge-linket viser blot adressen som
// et punkt med det samme uden den afhængighed.
const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

// Normaliseret til rent cifre + evt. indledende "+" så tel:-links virker
// uanset om nummeret er skrevet med mellemrum ("12 34 56 78").
const telHref = (phone) => `tel:${(phone || "").replace(/[^\d+]/g, "")}`;

const ARRIVAL_PRESETS_MIN = [5, 10, 15, 30, 60];

// Popover til at vælge "ankomst om X minutter" og sende SMS'en MED DET
// SAMME ved tryk - via en Edge Function der sender fra firmaets fælles
// Twilio-nummer. IKKE via montørens egen telefon: montøren har typisk sin
// egen private telefon, og skal hverken dele sit nummer eller selv afsende
// noget manuelt.
function ArrivalSmsButton({ phone, customerName }) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState({ state: "idle" });
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

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
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60"
        title="Send SMS om forventet ankomst"
      >
        {status.state === "sending" ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : status.state === "sent" ? <Check size={13} className="text-success" aria-hidden="true" /> : <MessageSquare size={13} aria-hidden="true" />}
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
                className="text-center px-2 py-2.5 rounded-lg text-xs font-mono border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50"
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
            <button key={m.id} onClick={() => onSelect(m.id)} className="w-full text-left rounded-xl bg-white border border-line hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors p-4 flex items-center gap-3 shadow-sm">
              <Truck size={18} style={{ color: technicianColor(m.id, technicians) }} aria-hidden="true" />
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
// træk-og-slip (langt mindre pålideligt på touch, især med en scrollende
// liste bagved) - to store knapper virker forudsigeligt med tommelfingeren.
function ReorderButtons({ onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  return (
    <div className="flex flex-col shrink-0" onClick={(e) => e.stopPropagation()}>
      <button onClick={onMoveUp} disabled={!canMoveUp} aria-label="Flyt tidligere i ruten" className="p-2 rounded-md text-muted hover:text-brand hover:bg-panel disabled:opacity-20 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Flyt tidligere i ruten">
        <ChevronUp size={16} aria-hidden="true" />
      </button>
      <button onClick={onMoveDown} disabled={!canMoveDown} aria-label="Flyt senere i ruten" className="p-2 rounded-md text-muted hover:text-brand hover:bg-panel disabled:opacity-20 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Flyt senere i ruten">
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

// Ét kort pr. sag i montørens rute. Opdelt i tydeligt adskilte sektioner
// (header / alerts / kontakt / varelinjer) i stedet for én lang stak
// tekstlinjer - det gør kortet hurtigere at skimme i marken.
//
// ÆNDRET (september 2026): status-badget kan ikke længere klikkes. Det
// cyklede planlagt -> i gang -> afsluttet -> planlagt, og et fejlklik på
// en afsluttet sag sendte den tilbage til start uden at spørge. Start og
// færdigmelding sker nu inde på sagen, hvor der er plads til at gøre det
// tydeligt, hvad man er ved at gøre.
function OrderStopCard({ order: s, onOpen, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const hasAlerts = Boolean(s.noegle?.kraeves || s.kunde.leveringsnote);

  return (
    <div className="rounded-xl bg-white border border-[#ECECEC] shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {(onMoveUp || onMoveDown) && <ReorderButtons onMoveUp={onMoveUp} onMoveDown={onMoveDown} canMoveUp={canMoveUp} canMoveDown={canMoveDown} />}
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="font-mono text-lg font-semibold text-ink shrink-0">{s.start}–{s.slut}</span>
              {s.stemplerInd ? (
                <span className="font-mono text-[11px] text-brand flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" /> i gang
                </span>
              ) : (
                <span className="font-mono text-[11px] text-muted flex items-center gap-1 shrink-0" title="Forventet/registreret tidsforbrug">
                  <Clock size={10} aria-hidden="true" /> {formatDuration(totalMinutes(s) > 0 ? totalMinutes(s) : orderExpectedMinutes(s))}
                </span>
              )}
            </div>
          </div>
          <StatusBadge status={s.status} />
        </div>
        <button type="button" onClick={() => onOpen(s.id)} className="text-left w-full mt-1.5 focus:outline-none focus:ring-2 focus:ring-brand rounded">
          <p className="font-semibold text-ink truncate">{buildTitle(s.varelinjer)}</p>
          <p className="text-sm text-muted truncate">{s.kunde.navn}{s.koeber && <span className="text-muted"> · køber {s.koeber.navn}</span>}</p>
        </button>
        {s.problem && (
          <p className="text-xs font-semibold text-danger flex items-center gap-1.5 mt-1"><AlertTriangle size={12} className="shrink-0" aria-hidden="true" /> Markeret: kom ikke i mål</p>
        )}
      </div>

      {hasAlerts && (
        <div className="mx-4 mb-3 rounded-lg bg-brand/5 border border-brand/20 px-3 py-2 space-y-1">
          {s.noegle?.kraeves && (
            <p className="text-xs font-semibold text-brand flex items-center gap-1.5"><KeyRound size={13} className="shrink-0" aria-hidden="true" /> {keyAccessText(s.noegle)}</p>
          )}
          {s.kunde.leveringsnote && (
            <p className="text-xs font-semibold text-brand flex items-center gap-1.5"><AlertTriangle size={13} className="shrink-0" aria-hidden="true" /> {s.kunde.leveringsnote}</p>
          )}
        </div>
      )}

      <div className="px-4 py-3 bg-panel/60 border-t border-divider space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-ink truncate min-w-0">{s.kunde.adresse}</p>
          <a href={mapsUrl(s.kunde.adresse)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Åbn adressen i Google Maps">
            <Navigation size={13} aria-hidden="true" /> Naviger
          </a>
        </div>

        {s.kunde.telefon && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <a href={telHref(s.kunde.telefon)} className="font-mono text-sm text-ink hover:text-brand transition-colors" title="Ring til kunden">{s.kunde.telefon}</a>
            <div className="flex items-center gap-2">
              <a href={telHref(s.kunde.telefon)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Ring til kunden">
                <Phone size={13} aria-hidden="true" /> Ring
              </a>
              <ArrivalSmsButton phone={s.kunde.telefon} customerName={s.kunde.navn} />
            </div>
          </div>
        )}
      </div>

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

function TechnicianRouteView({ orders, technician, selectedDate, onDateChange, onOpen, onReorder, onChangeTechnician, onRefresh, refreshing }) {
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
            <p className="text-sm text-muted">{myOrders.length} sager · {done} færdigmeldt</p>
            <DateSelector date={selectedDate} onChange={onDateChange} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} aria-label="Opdater" className="p-2.5 rounded-lg text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Opdater">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
          </button>
          {onChangeTechnician && (
            <button onClick={onChangeTechnician} className="px-4 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors">
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
            <p className="text-[11px] text-muted mb-3 flex items-center gap-1.5"><ChevronUp size={11} aria-hidden="true" /><ChevronDown size={11} aria-hidden="true" /> Brug pilene på et kort til at ændre besøgsrækkefølgen.</p>
          )}
          <div className="relative pl-8">
            <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-line" />
            {myOrders.map((s, i) => (
              <div key={s.id} className="relative mb-4">
                <div className="absolute -left-8 top-5 w-4 h-4 rounded-full border-2 bg-paper" style={{ borderColor: STATUS_META[s.status].color }} />
                <OrderStopCard
                  order={s}
                  onOpen={onOpen}
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
// her - en tillægsydelse beskriver blot OMFANGET af opgaven på den vare.
// Vises som almindelig tekst, ikke som farvede pille-mærker: det var
// forvirrende at have "bobler" for noget, der ikke kan trykkes på.
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

// Materialeforbrug UD OVER det oprindeligt planlagte. Bevidst en EGEN
// fane, adskilt fra "Noter" (fri tekst) og varelinjerne (det der blev
// solgt) - så det senere er let at finde igen, fx til fakturering.
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
            aria-label="Materiale"
            className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
          />
          <input
            type="number" min="1" value={antal}
            onChange={(e) => setAntal(e.target.value)}
            aria-label="Antal"
            className="w-16 rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink text-center focus:outline-none focus:border-brand"
          />
          <button onClick={submit} aria-label="Tilføj materiale" className="w-11 shrink-0 flex items-center justify-center rounded-lg text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors"><Plus size={16} aria-hidden="true" /></button>
        </div>
      ) : (
        <p className="text-xs text-muted italic mb-4 flex items-center gap-1.5"><Lock size={12} className="shrink-0" aria-hidden="true" /> Du kan se, men ikke tilføje, materialeforbrug på denne sag.</p>
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
              {onRemove && <button onClick={() => onRemove(m.id)} aria-label={`Fjern ${m.navn}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger shrink-0"><X size={16} aria-hidden="true" /></button>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted mt-3">Til ekstra materiale brugt udover det planlagte, fx en længere slange eller ekstra beslag - til senere brug ved fakturering.</p>
    </div>
  );
}

// Panel til at markere sagen med et PROBLEM - fx kunden var ikke hjemme,
// mangler dele, adgangsproblem. UAFHÆNGIG af status: montøren kan sagtens
// færdigmelde en sag, der ikke kom i mål som planlagt, og markeringen
// fortæller sælgeren hvorfor.
function ProblemPanel({ order, onSubmit, onCancel }) {
  const [note, setNote] = React.useState("");
  return (
    <div className="rounded-xl bg-white border border-danger p-4 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-danger mb-1 flex items-center gap-1.5"><AlertTriangle size={14} aria-hidden="true" /> Marker: kom ikke i mål</h3>
      <p className="text-xs text-muted mb-3">Fx kunden ikke hjemme, mangler dele, adgangsproblem. Sælgeren der har booket sagen ({order.oprettetAf?.navn || "ukendt"}) får automatisk besked om det.</p>
      <textarea
        autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3}
        placeholder="Kort beskrivelse af hvad der gik galt..."
        aria-label="Beskrivelse af problemet"
        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-danger mb-3"
      />
      <div className="flex gap-2">
        <button onClick={() => note.trim() && onSubmit(note)} disabled={!note.trim()} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-danger hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ink transition-opacity flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
          <Check size={14} aria-hidden="true" /> Gem markering
        </button>
        <button onClick={onCancel} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors flex items-center gap-1.5"><X size={14} aria-hidden="true" /> Annuller</button>
      </div>
    </div>
  );
}

// ---------------- FÆRDIGMELDING (september 2026) ----------------
// Erstatter status-skifteren. Den var et badge, der cyklede planlagt ->
// i gang -> afsluttet -> planlagt; det var uklart hvad et klik gjorde, og
// et fejlklik på en afsluttet sag sendte den hele vejen tilbage til start.
//
// Færdigmelding er nu ÉN tydelig handling med ét formål - og med en
// PÅMINDELSE om dokumentation lige før. Placeringen er hele pointen:
// montøren står stadig hos kunden og kan nå at tage billedet eller taste
// den ekstra vandslange. En påmindelse bagefter, når han sidder i bilen,
// er ubrugelig.
//
// Påmindelsen BLOKERER bevidst ikke. Der findes rigtige opgaver uden
// billeder, og en tvungen upload ville få folk til at fotografere gulvet
// for at komme videre - så ville vi have dokumentation, der ser ud af
// noget, men intet siger. Den fortæller hvad der mangler, og lader
// montøren bestemme.
//
// Færdigmeldingen sætter samtidig sluttidspunktet, som tidsestimaterne
// bygger på (se data/estimates.js). Det er derfor, den skal være en
// handling, montøren udfører for sin egen skyld - så måling falder ud af
// arbejdsgangen i stedet for at være en ekstra pligt.
function FinishPanel({ order, onConfirm, onCancel, onGoToTab }) {
  const mangler = [];
  if ((order.billeder || []).length === 0) mangler.push({ key: "billeder", tekst: "Ingen billeder på sagen" });
  if ((order.rapporter || []).length === 0) mangler.push({ key: "rapporter", tekst: "Ingen rapport skrevet" });
  if ((order.materialer || []).length === 0) mangler.push({ key: "materialer", tekst: "Intet ekstra materialeforbrug noteret" });

  const varighed = totalMinutes(order);

  return (
    <div className="rounded-xl bg-white border border-success p-4 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-1.5">
        <CheckCheck size={15} className="text-success" aria-hidden="true" /> Færdigmeld sag #{order.nr}
      </h3>
      <p className="text-xs text-muted mb-3">{order.kunde?.navn} · {buildTitle(order.varelinjer)}</p>

      {mangler.length > 0 ? (
        <div className="rounded-lg bg-panel border border-line p-3 mb-3">
          <p className="text-xs font-semibold text-ink mb-1.5 flex items-center gap-1.5">
            <Camera size={13} className="shrink-0 text-brand" aria-hidden="true" /> Inden du melder færdig — mangler der noget?
          </p>
          <ul className="space-y-1">
            {mangler.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">{m.tekst}</span>
                <button onClick={() => onGoToTab(m.key)} className="text-[11px] font-semibold uppercase tracking-wide text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1 shrink-0">
                  Tilføj
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted mt-2">Du kan godt færdigmelde uden — det er en påmindelse, ikke et krav.</p>
        </div>
      ) : (
        <p className="text-xs text-success mb-3 flex items-center gap-1.5">
          <Check size={13} className="shrink-0" aria-hidden="true" /> Billeder, rapport og materialeforbrug er på plads.
        </p>
      )}

      {varighed > 0 && <p className="text-xs text-muted mb-3">Registreret tid på sagen: {formatDuration(varighed)}.</p>}

      <div className="flex gap-2 flex-wrap">
        <button onClick={onConfirm} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-success hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink transition-colors flex items-center gap-1.5">
          <CheckCheck size={15} aria-hidden="true" /> Færdigmeld sagen
        </button>
        <button onClick={onCancel} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors flex items-center gap-1.5">
          <X size={14} aria-hidden="true" /> Ikke endnu
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MONTØR-SPECIFIK SAGSDETALJE - bevidst en HELT SEPARAT visning fra den
// delte OrderView.jsx, som bruges af admin/sælger.
//
// ÆNDRET (september 2026): underskriften er fjernet helt (der er ingen til
// at skrive under i et tomt lejemål, og billeddokumentationen er den
// rigtige dokumentation), og status-skifteren er erstattet af "Start
// opgave" og "Færdigmeld" - se FinishPanel ovenfor.
//
// RETTIGHEDER: montør-rollen får som standard alle sag_*-rettigheder, så
// for de fleste montører ændrer låsningen nedenfor intet. Den betyder
// noget for en montør, der individuelt har fået frataget en rettighed.
function TechnicianOrderDetail({ order, technicians, onBack, addNote, addPhoto, addReport, onStartOrder, onFinishOrder, onReopenOrder, onUpdateBooking, onDuplicate, onAddMaterial, onRemoveMaterial, onMarkProblem, onClearProblem, permissions }) {
  const [tab, setTab] = React.useState("noter");
  // Kun ét panel ad gangen.
  const [panel, setPanel] = React.useState(null); // "booking" | "dupliker" | "problem" | "faerdig"
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
  ];

  const erAfsluttet = order.status === "afsluttet";
  const erIGang = order.status === "igang";

  return (
    <div>
      <button onClick={onBack} className="text-sm text-muted hover:text-brand mb-4 flex items-center gap-1">← Tilbage</button>

      {panel === "booking" ? (
        <BookingEditor order={order} technicians={technicians} permissions={permissions} onCancel={() => setPanel(null)} onSave={(fields) => { onUpdateBooking(fields); setPanel(null); }} />
      ) : panel === "dupliker" ? (
        <DuplicatePanel order={order} onCancel={() => setPanel(null)} onDuplicate={(items) => { onDuplicate?.(items); setPanel(null); }} />
      ) : panel === "problem" ? (
        <ProblemPanel order={order} onCancel={() => setPanel(null)} onSubmit={(note) => { onMarkProblem?.(note); setPanel(null); }} />
      ) : panel === "faerdig" ? (
        <FinishPanel
          order={order}
          onCancel={() => setPanel(null)}
          onGoToTab={(key) => { setTab(key); setPanel(null); }}
          onConfirm={() => { onFinishOrder?.(); setPanel(null); }}
        />
      ) : (
        <div className="rounded-xl bg-white border border-line p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <p className="font-mono text-xs text-muted">
              #{order.nr} · {formatLongDate(order.dato)} · {order.start}–{order.slut}
              {order.ordrenummer && <span className="ml-2 inline-flex items-center gap-0.5"><Hash size={10} aria-hidden="true" /> {order.ordrenummer}</span>}
            </p>
            <StatusBadge status={order.status} />
          </div>
          {order.oprettetAf?.navn && (
            <p className="text-xs text-muted mb-1 flex items-center gap-1"><User size={11} className="shrink-0" aria-hidden="true" /> Booket af {order.oprettetAf.navn}</p>
          )}
          <p className="text-lg font-semibold text-ink leading-snug">{order.varelinjer.length} {order.varelinjer.length === 1 ? "vare" : "varer"} til {order.kunde.navn}</p>
          {order.kunde.leveringsnote && (
            <p className="text-sm text-brand font-semibold mt-1.5 flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" aria-hidden="true" /> {order.kunde.leveringsnote}</p>
          )}
          {order.noegle?.kraeves && (
            <p className="text-sm text-brand font-semibold mt-1.5 flex items-center gap-1.5"><KeyRound size={14} className="shrink-0" aria-hidden="true" /> {keyAccessText(order.noegle)}</p>
          )}

          {order.problem && (
            <div className="mt-2.5 rounded-lg bg-danger/10 border border-danger px-3 py-2">
              <p className="text-sm font-semibold text-danger flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" aria-hidden="true" /> Markeret: kom ikke i mål</p>
              <p className="text-xs text-danger mt-0.5">{order.problem.note} · {order.problem.tid}</p>
              {onClearProblem && canFieldwork && <button onClick={onClearProblem} className="text-[11px] text-danger underline hover:no-underline mt-1 py-1">Fjern markering</button>}
            </div>
          )}

          {/* HOVEDHANDLINGEN. Fylder hele bredden og står før alt det
              sekundære: det er den ene knap, montøren skal bruge, og den
              skal kunne rammes med tommelfingeren uden at kigge. */}
          {canFieldwork && (
            <div className="mt-3 pt-3 border-t border-divider">
              {erAfsluttet ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm text-success font-semibold flex items-center gap-1.5"><CheckCheck size={15} aria-hidden="true" /> Sagen er færdigmeldt</p>
                  {onReopenOrder && (
                    <button onClick={onReopenOrder} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-2 py-2">
                      Genåbn sagen
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {!erIGang && onStartOrder && (
                    <button onClick={onStartOrder} className="flex-1 min-w-[150px] px-4 py-3.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center justify-center gap-2">
                      <PlayCircle size={17} aria-hidden="true" /> Start opgave
                    </button>
                  )}
                  {onFinishOrder && (
                    <button onClick={() => setPanel("faerdig")} className="flex-1 min-w-[150px] px-4 py-3.5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-success hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink transition-colors flex items-center justify-center gap-2">
                      <CheckCheck size={17} aria-hidden="true" /> Færdigmeld
                    </button>
                  )}
                </div>
              )}
              {erIGang && order.stemplerInd && (
                <p className="text-[11px] text-brand mt-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" /> Opgaven er i gang — tiden tælles indtil du færdigmelder.
                </p>
              )}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-divider space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-ink truncate min-w-0">{order.kunde.adresse}</p>
              <a href={mapsUrl(order.kunde.adresse)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Åbn adressen i Google Maps">
                <Navigation size={13} aria-hidden="true" /> Naviger
              </a>
            </div>
            {order.kunde.telefon && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <a href={telHref(order.kunde.telefon)} className="font-mono text-sm text-ink hover:text-brand transition-colors" title="Ring til kunden">{order.kunde.telefon}</a>
                <div className="flex items-center gap-2">
                  <a href={telHref(order.kunde.telefon)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors" title="Ring til kunden">
                    <Phone size={13} aria-hidden="true" /> Ring
                  </a>
                  <ArrivalSmsButton phone={order.kunde.telefon} customerName={order.kunde.navn} />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-divider">
            {(canPlan || canEditCustomer) && (
              <button onClick={() => setPanel("booking")} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1.5 flex items-center gap-1"><Pencil size={13} aria-hidden="true" /> Redigér booking</button>
            )}
            {onDuplicate && canCreate && (
              <button onClick={() => setPanel("dupliker")} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand rounded px-1 py-1.5 flex items-center gap-1"><Copy size={13} aria-hidden="true" /> Dupliker / opfølgning</button>
            )}
            {onMarkProblem && canFieldwork && !order.problem && (
              <button onClick={() => setPanel("problem")} className="text-xs font-semibold uppercase tracking-wide text-danger hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-danger rounded px-1 py-1.5 flex items-center gap-1"><AlertTriangle size={13} aria-hidden="true" /> Marker: kom ikke i mål</button>
            )}
          </div>
        </div>
      )}

      <TechnicianLineItems order={order} />

      <div className="flex border-b border-line mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-brand ${tab === t.key ? "text-ink border-b-2 border-brand" : "text-muted hover:text-ink"}`}>
            {t.label} <span className="font-mono text-xs">({t.count})</span>
          </button>
        ))}
      </div>
      {tab === "noter" && <Notes order={order} onAdd={canFieldwork ? addNote : undefined} />}
      {tab === "materialer" && <Materials order={order} onAdd={canFieldwork ? (m) => onAddMaterial?.(m) : undefined} onRemove={canFieldwork ? (id) => onRemoveMaterial?.(id) : undefined} />}
      {tab === "billeder" && <Photos order={order} onAdd={canFieldwork ? addPhoto : undefined} />}
      {tab === "rapporter" && <Reports order={order} onAdd={canFieldwork ? addReport : undefined} />}
      {tab === "tid" && <TimeLog order={order} />}
    </div>
  );
}

export { TechnicianPicker, TechnicianRouteView, TechnicianOrderDetail };
