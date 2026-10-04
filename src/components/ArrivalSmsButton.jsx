import React from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Check, Loader2, X } from "lucide-react";
import { sendArrivalSms } from "../lib/dataStore";

const ARRIVAL_PRESETS_MIN = [5, 10, 15, 30, 60];

// Knap + panel til at sende "ankomst om X minutter" som SMS - via en Edge
// Function der sender fra firmaets fælles nummer. IKKE via montørens egen
// telefon: montøren bruger typisk sin private telefon og skal hverken dele sit
// nummer med kunden eller selv afsende noget manuelt.
//
// variant="stak" gør knappen til ét lag i den lodrette handlingsstak på
// rutekortet (se ActionStack i pages/TechnicianPage.jsx).
//
// PANELET (oktober 2026, rettet): valget af minutter åbnede før som en lille
// boks lige under knappen. Men knappen sidder i handlingsstakken på 74 px, som
// har overflow-hidden - og boksen på 224 px blev klippet, så kun yderste kant
// kunne ses henover Ring-knappen. Nu vises valget som et panel i bunden af
// skærmen (midt på skærmen på en stor skærm), tegnet via en portal direkte under
// <body>, så ingen omgivende beskæring eller stakkeorden kan ramme det.
// Valgene er store nok til en tommelfinger, og modtageren vises, så man kan se,
// hvem SMS'en går til, før man trykker.
function ArrivalSmsButton({ phone, customerName, variant }) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState({ state: "idle" });
  const triggerRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const sendingRef = React.useRef(false);

  const luk = React.useCallback(() => {
    if (sendingRef.current) return; // luk ikke midt i en afsendelse
    setOpen(false);
    setStatus((s) => (s.state === "sending" ? s : { state: "idle" }));
  }, []);

  // Efter en vellykket afsendelse lukkes panelet af sig selv.
  React.useEffect(() => {
    if (status.state !== "sent") return undefined;
    const t = setTimeout(() => { setOpen(false); setStatus({ state: "idle" }); }, 1600);
    return () => clearTimeout(t);
  }, [status]);

  // Mens panelet er åbent: Escape lukker, siden bagved ruller ikke, og fokus
  // flyttes ind i panelet og tilbage til knappen, når det lukkes.
  React.useEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const foer = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") luk(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = foer;
      document.removeEventListener("keydown", onKey);
      trigger?.focus?.();
    };
  }, [open, luk]);

  if (!phone) return null;

  const send = async (minutter) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setStatus({ state: "sending" });
    try {
      const result = await sendArrivalSms({ telefon: phone, minutter, kundeNavn: customerName });
      setStatus(result.ok ? { state: "sent" } : { state: "error", fejl: result.fejl || "SMS'en kunne ikke sendes." });
    } catch (e) {
      setStatus({ state: "error", fejl: "SMS'en kunne ikke sendes. Prøv igen." });
    } finally {
      sendingRef.current = false;
    }
  };

  const erStak = variant === "stak";
  const sender = status.state === "sending";
  const ikon = sender
    ? <Loader2 size={erStak ? 15 : 13} className="animate-spin" aria-hidden="true" />
    : status.state === "sent"
      ? <Check size={erStak ? 15 : 13} className="text-success" aria-hidden="true" />
      : <MessageSquare size={erStak ? 15 : 13} aria-hidden="true" />;

  const panel = open && typeof document !== "undefined" ? createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40"
      onClick={luk}
      data-testid="sms-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sms-titel"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 id="sms-titel" className="text-sm font-semibold uppercase tracking-wide text-ink">Send ankomst-SMS</h3>
            <p className="text-xs text-muted truncate">{customerName || "Kunden"} · <span className="font-mono">{phone}</span></p>
          </div>
          <button type="button" onClick={luk} disabled={sender} aria-label="Luk" className="w-11 h-11 -m-2 shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-40">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Ankomst om…</p>
        <div className="grid grid-cols-3 gap-2">
          {ARRIVAL_PRESETS_MIN.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => send(m)}
              disabled={sender || status.state === "sent"}
              className="min-h-[52px] rounded-lg text-sm font-mono font-semibold text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50"
            >
              {m} min
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-[20px]" aria-live="polite">
          {sender && <p className="text-xs text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Sender…</p>}
          {status.state === "sent" && <p className="text-xs text-success font-semibold flex items-center gap-1.5"><Check size={13} aria-hidden="true" /> SMS sendt</p>}
          {status.state === "error" && <p role="alert" className="text-xs text-danger font-semibold">{status.fejl}</p>}
          {status.state === "idle" && <p className="text-[11px] text-muted">Sendes med det samme fra butikkens nummer.</p>}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setStatus({ state: "idle" }); setOpen(true); }}
        disabled={sender}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Send SMS om forventet ankomst"
        className={erStak
          ? "w-full h-[46px] flex flex-col items-center justify-center gap-0.5 text-ink [@media(hover:hover)]:hover:bg-panel focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand transition-colors disabled:opacity-60"
          : "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60"}
        title="Send SMS om forventet ankomst"
      >
        {ikon}
        <span className={erStak ? "text-[9px] font-semibold uppercase tracking-wide" : ""}>
          {status.state === "sent" ? "Sendt" : "SMS"}
        </span>
      </button>
      {panel}
    </div>
  );
}

export { ArrivalSmsButton };
