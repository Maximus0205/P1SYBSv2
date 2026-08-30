import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Plus, Lock, Loader2, ImageOff } from "lucide-react";
import { formatTime, formatDuration, now, totalMinutes, lineItemLabel, serviceIcon } from "../data/domain";
import { getAttachments, getAttachmentUrls, uploadAttachment, markAttachmentForDeletion } from "../lib/attachments";

// RETTET (august 2026): alle "tilføj/rediger"-handlinger herunder
// (onAdd/onToggleAddOn/onSave osv.) kan nu være undefined - se
// OrderView.jsx/TechnicianPage.jsx, som bevidst IKKE sender dem med, hvis
// den indloggede bruger mangler den relevante rettighed
// (sag_feltarbejde). Hver komponent viser da en LÅST tilstand (ikon +
// kort besked) i stedet for enten at skjule sig helt eller - vigtigst -
// crashe ved at kalde en undefined funktion, hvis nogen når at klikke,
// inden UI'et opdaterer sig.
function LockedNotice({ text }) {
  return (
    <p className="text-xs text-muted italic mb-4 flex items-center gap-1.5"><Lock size={12} className="shrink-0" /> {text}</p>
  );
}

// RETTET (august 2026): slet-knapper var skjult med
// "opacity-0 group-hover:opacity-100". På en telefon eller tablet FINDES
// hover ikke - knappen var der, men usynlig og reelt uopnåelig. En montør
// på mobil kunne dermed ALDRIG fjerne en tillægsydelse eller et billede.
// Det er en tavs fejl: der er ingen fejlmeddelelse, funktionen er bare
// utilgængelig for præcis den brugergruppe, der bruger appen mest.
//
// Løsningen er ikke at fjerne hover-effekten, men at gøre den betinget:
// [@media(hover:hover)] gælder KUN enheder med en rigtig pegeenhed (mus/
// trackpad). Har enheden ikke hover - altså touch - er knappen synlig
// hele tiden. Bemærk at det skal være hover:hover og ikke fx en
// bredde-baseret grænse: en lille laptop har mus, og en stor tablet har
// ikke, så skærmbredde svarer ikke til inputmetode.
const HOVER_ONLY_VISIBLE = "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100";

function LineItemDetails({ order, onToggleAddOn, onAddAddOn, onRemoveAddOn }) {
  const [newItem, setNewItem] = useState({});
  const locked = !onToggleAddOn || !onAddAddOn || !onRemoveAddOn;
  return (
    <div className="rounded-xl bg-white border border-line p-4 mb-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-3">Varelinjer, ydelser & opmærksomhedspunkter</h3>
      {locked && <LockedNotice text="Du kan se, men ikke redigere, tillægsydelser på denne sag." />}
      <div className="space-y-4">
        {order.varelinjer.map((v) => {
          const addOns = v.tillaeg || [];
          const missing = addOns.filter((y) => !y.udfoert).length;
          return (
            <div key={v.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <p className="text-sm font-semibold text-ink">{lineItemLabel(v)}</p>
                  {v.primaerYdelse && <p className="text-[11px] text-muted">{v.primaerYdelse.navn}</p>}
                </div>
                {missing > 0 && <span className="font-mono text-[11px] text-brand">{missing} mangler</span>}
              </div>
              {addOns.length === 0 ? (
                <p className="text-xs text-muted italic mb-1">Ingen tillægsydelser/punkter for denne varelinje.</p>
              ) : (
                <div className="space-y-1 mb-1">
                  {addOns.map((y) => {
                    const Icon = serviceIcon(y.navn);
                    return (
                      <label key={y.id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg group ${locked ? "" : "hover:bg-panel cursor-pointer"}`}>
                        {/* Afkrydsningsfeltet er forstørret til 20px: 16px er
                            under det, en tommelfinger rammer pålideligt, og
                            det her er den handling, montøren udfører flest
                            gange om dagen. */}
                        <input type="checkbox" checked={y.udfoert} disabled={locked} onChange={() => onToggleAddOn(v.id, y.id)} className="w-5 h-5 accent-success disabled:opacity-60 shrink-0" />
                        <Icon size={14} className="text-muted shrink-0" strokeWidth={2.5} />
                        <span className={`text-sm flex-1 ${y.udfoert ? "line-through text-muted" : "text-ink"}`}>{y.navn}</span>
                        {!locked && (
                          <button
                            onClick={(e) => { e.preventDefault(); onRemoveAddOn(v.id, y.id); }}
                            aria-label={`Fjern tillægsydelsen ${y.navn}`}
                            className={`shrink-0 -my-2 w-11 h-11 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand ${HOVER_ONLY_VISIBLE}`}
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
              {!locked && (
                <div className="flex gap-2 pl-2">
                  <input
                    value={newItem[v.id] || ""}
                    onChange={(e) => setNewItem((p) => ({ ...p, [v.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter" && (newItem[v.id] || "").trim()) { onAddAddOn(v.id, newItem[v.id].trim()); setNewItem((p) => ({ ...p, [v.id]: "" })); } }}
                    placeholder="Tilføj punkt..."
                    aria-label="Tilføj tillægsydelse eller opmærksomhedspunkt"
                    className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                  />
                  <button onClick={() => { if (!(newItem[v.id] || "").trim()) return; onAddAddOn(v.id, newItem[v.id].trim()); setNewItem((p) => ({ ...p, [v.id]: "" })); }} aria-label="Tilføj punkt" className="w-11 shrink-0 flex items-center justify-center rounded-lg text-ink border border-line hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors"><Plus size={16} aria-hidden="true" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Hver note viser nu, HVEM der har skrevet den (forfatter.navn), ikke kun
// tidspunktet - vigtigt når flere forskellige personer (sælger OG montør)
// kan notere på samme sag, og det ellers ikke er til at se, hvem der har
// sagt hvad. Ældre noter oprettet før dette blev tilføjet mangler
// forfatter-feltet og viser derfor blot tidspunktet, som før.
function Notes({ order, onAdd }) {
  const [text, setText] = useState("");
  return (
    <div>
      {onAdd ? (
        <div className="flex gap-2 mb-4">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv en note om sagen..." aria-label="Ny note" rows={2} className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand resize-none" />
          <button onClick={() => { if (!text.trim()) return; onAdd(text); setText(""); }} className="px-4 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors">Tilføj</button>
        </div>
      ) : (
        <LockedNotice text="Du kan se, men ikke tilføje, noter på denne sag." />
      )}
      {order.noter.length === 0 ? <p className="text-sm text-muted italic">Ingen noter endnu for denne sag.</p> : (
        <div className="space-y-2">
          {[...order.noter].reverse().map((n) => (
            <div key={n.id} className="rounded-lg border-l-2 border-brand bg-white px-3 py-2 shadow-sm">
              <p className="text-sm text-ink">{n.tekst}</p>
              <p className="font-mono text-[11px] text-muted mt-1">{n.forfatter?.navn ? `${n.forfatter.navn} · ` : ""}{n.tid}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// OMLAGT (august 2026): billeder gemmes ikke længere som base64 inde i
// sagens jsonb-blob, men som rigtige filer i et lager - se
// lib/attachments.js for hele baggrunden. Kort fortalt fyldte ÉN sag med
// billeder 2,5 MB, og appen henter ALLE butikkens sager med hele blobben
// ved hver indlæsning, også på montørernes mobiler.
//
// BAGUDKOMPATIBILITET: gamle billeder ligger stadig i order.billeder som
// base64. De vises fortsat, side om side med de nye - der er ingen
// big-bang-migrering, og ingen sag mister sin dokumentation. Nye billeder
// lander altid i det nye lager. Gamle kan ikke slettes herfra (de sidder i
// selve sagen), og det er med vilje: dokumentation for udført arbejde
// skal ikke kunne forsvinde ved et uheld.
//
// KOMPRIMERING (august 2026): et moderne mobilkamera leverer 4-8 MB pr.
// billede. Fem billeder fra en kælder på 4G er 30 MB - det tager
// evigheder, fejler ofte undervejs, og butikken betaler for lagerplads,
// den ikke har brug for. Billedet skaleres derfor ned til maks. 1600 px
// og gemmes som JPEG (kvalitet 0,8), før det sendes. Det giver typisk
// 300-500 KB uden synligt tab på et dokumentationsbillede, hvor pointen
// er "sådan så installationen ud", ikke trykklar opløsning.
//
// onAdd bruges IKKE længere til at gemme (det gør uploadAttachment), men
// bevares som det SIGNAL fra OrderView/TechnicianPage om, hvorvidt den
// indloggede har rettigheden sag_feltarbejde. På den måde er
// rettighedslogikken ét sted, og de to kaldende sider behøver ikke ændres.
// Serveren tjekker selv rettigheden igen ved upload - UI'et er ikke en
// sikkerhedsgrænse.
const MAKS_BILLEDKANT = 1600;
const JPEG_KVALITET = 0.8;

async function komprimerBillede(file) {
  // Kun rigtige billeder. En PDF eller en HEIC, browseren ikke kan tegne,
  // sendes uændret igennem - hellere en stor fil end ingen fil.
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const skala = Math.min(1, MAKS_BILLEDKANT / Math.max(bitmap.width, bitmap.height));
    // Er billedet allerede lille nok, er der intet at vinde ved at tegne
    // det om - og en omkodning ville kun forringe det.
    if (skala === 1 && file.size < 800 * 1024) { bitmap.close?.(); return file; }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * skala);
    canvas.height = Math.round(bitmap.height * skala);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", JPEG_KVALITET));
    if (!blob || blob.size >= file.size) return file; // ingen gevinst
    const navn = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], navn, { type: "image/jpeg" });
  } catch (_) {
    // Kan browseren ikke læse formatet (fx visse HEIC-varianter), er den
    // rigtige opførsel at sende originalen - ikke at tabe billedet.
    return file;
  }
}

function Photos({ order, onAdd }) {
  const inputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null); // {antal, faerdige, trin}
  const canEdit = !!onAdd;

  const legacyPhotos = order.billeder || [];

  const load = useCallback(async () => {
    setLoading(true);
    const liste = await getAttachments(order.id);
    const billeder = liste.filter((a) => a.kind === "billede");
    setAttachments(billeder);
    if (billeder.length > 0) {
      const svar = await getAttachmentUrls(billeder.map((a) => a.id));
      setUrls(svar.ok ? svar.urls || {} : {});
    } else {
      setUrls({});
    }
    setLoading(false);
  }, [order.id]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = async (files) => {
    const liste = Array.from(files);
    if (liste.length === 0) return;
    // Sekventielt, ikke parallelt: en montør på mobildata får en
    // væsentligt mere pålidelig upload af fem billeder ét ad gangen end
    // fem samtidige, der konkurrerer om en dårlig forbindelse.
    for (let i = 0; i < liste.length; i++) {
      setUploading({ antal: liste.length, faerdige: i, trin: "komprimerer" });
      const fil = await komprimerBillede(liste[i]);
      await uploadAttachment({
        orderId: order.id,
        file: fil,
        kind: "billede",
        onProgress: (trin) => setUploading({ antal: liste.length, faerdige: i, trin }),
      });
      // Fejl melder uploadAttachment selv videre til brugeren (se
      // SaveErrorBanner) - vi stopper ikke resten af billederne af den
      // grund, de øvrige kan sagtens gå igennem.
    }
    setUploading(null);
    await load();
  };

  const handleRemove = async (id) => {
    const svar = await markAttachmentForDeletion(id);
    if (svar.ok) setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const trinTekst = { komprimerer: "Forbereder billedet...", starter: "Forbereder...", sender: "Sender...", bekraefter: "Gemmer..." };
  const intetAtVise = !loading && attachments.length === 0 && legacyPhotos.length === 0;

  return (
    <div>
      {canEdit ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); inputRef.current?.click(); } }}
          className={`mb-4 rounded-xl border border-dashed bg-white p-6 text-center transition-colors focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 ${uploading ? "border-line opacity-70 cursor-wait" : "border-line hover:border-brand cursor-pointer"}`}
        >
          {uploading ? (
            <p className="text-sm text-muted flex items-center justify-center gap-2">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              {trinTekst[uploading.trin] || "Sender..."} ({uploading.faerdige + 1} af {uploading.antal})
            </p>
          ) : (
            <p className="text-sm text-muted">Tryk for at tilføje billeder fra sagen</p>
          )}
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) { handleFiles(e.target.files); e.target.value = ""; } }} />
        </div>
      ) : (
        <LockedNotice text="Du kan se, men ikke tilføje, billeder på denne sag." />
      )}

      {loading ? (
        <p className="text-sm text-muted italic flex items-center gap-2"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter billeder...</p>
      ) : intetAtVise ? (
        <p className="text-sm text-muted italic">Ingen billeder endnu for denne sag.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {attachments.map((a) => {
            const fil = urls[a.id];
            return (
              <div key={a.id} className="rounded-xl overflow-hidden border border-line bg-white shadow-sm group relative">
                {fil ? (
                  <img src={fil.url} alt={a.navn || "Billede fra sagen"} className="w-full h-32 object-cover" />
                ) : (
                  // Lageret svarede ikke. Sagen og alt andet virker
                  // stadig - kun billedet mangler, og det siges ligeud i
                  // stedet for at vise et gået-i-stykker-ikon.
                  <div className="w-full h-32 flex flex-col items-center justify-center gap-1 bg-panel text-muted">
                    <ImageOff size={18} aria-hidden="true" />
                    <span className="text-[10px] px-2 text-center">Kunne ikke hentes</span>
                  </div>
                )}
                <p className="text-[11px] text-muted px-2 py-1 truncate">{a.navn || "Billede"}</p>
                {canEdit && (
                  <button
                    onClick={() => handleRemove(a.id)}
                    aria-label={`Fjern billedet ${a.navn || ""}`}
                    className={`absolute top-1 right-1 w-11 h-11 flex items-center justify-center rounded-lg bg-white/90 text-muted hover:text-danger border border-line focus:outline-none focus:ring-2 focus:ring-danger ${HOVER_ONLY_VISIBLE}`}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
          {/* Gamle base64-billeder fra før omlægningen. Vises uændret. */}
          {legacyPhotos.map((b) => (
            <div key={b.id} className="rounded-xl overflow-hidden border border-line bg-white shadow-sm">
              <img src={b.src} alt={b.navn} className="w-full h-32 object-cover" />
              <p className="text-[11px] text-muted px-2 py-1 truncate">{b.navn}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Reports({ order, onAdd }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  return (
    <div>
      {onAdd ? (
        <div className="rounded-xl border border-line bg-white p-4 mb-4 shadow-sm">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rapporttitel, fx 'Afleveringsrapport'" aria-label="Rapporttitel" className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink mb-2 focus:outline-none focus:border-brand" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Beskrivelse af udført arbejde..." aria-label="Beskrivelse af udført arbejde" rows={3} className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink mb-2 focus:outline-none focus:border-brand resize-none" />
          <button onClick={() => { if (!title.trim() || !text.trim()) return; onAdd(title, text); setTitle(""); setText(""); }} className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors">Gem rapport</button>
        </div>
      ) : (
        <LockedNotice text="Du kan se, men ikke oprette, rapporter på denne sag." />
      )}
      {order.rapporter.length === 0 ? <p className="text-sm text-muted italic">Ingen rapporter endnu for denne sag.</p> : (
        <div className="space-y-2">
          {[...order.rapporter].reverse().map((r) => (
            <div key={r.id} className="rounded-xl border border-line bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-sm text-ink">{r.titel}</p>
                <p className="font-mono text-[11px] text-muted">{r.tid}</p>
              </div>
              <p className="text-sm text-muted">{r.tekst}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeLog({ order }) {
  const mins = totalMinutes(order);
  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-4 mb-4 flex items-center justify-between shadow-sm">
        <span className="text-sm text-muted">Samlet registreret tid</span>
        <span className="font-mono text-lg text-ink">{formatDuration(mins)}</span>
      </div>
      {order.logs.length === 0 ? <p className="text-sm text-muted italic">Ingen stemplinger registreret endnu.</p> : (
        <div className="space-y-2">
          {[...order.logs].reverse().map((l) => (
            <div key={l.id} className="rounded-xl border border-line bg-white p-3 flex items-center justify-between shadow-sm">
              <span className="font-mono text-sm text-ink">{formatTime(l.ind)} → {formatTime(l.ud)}</span>
              <span className="font-mono text-sm text-muted">{formatDuration(l.minutter)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClockWidget({ order, onClockIn, onClockOut }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!order.stemplerInd) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [order.stemplerInd]);

  const liveSeconds = order.stemplerInd ? Math.max(0, Math.floor((Date.now() - new Date(order.stemplerInd)) / 1000)) : 0;
  const hh = String(Math.floor(liveSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((liveSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(liveSeconds % 60).padStart(2, "0");
  const locked = !onClockIn || !onClockOut;

  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-white p-4 mb-5 shadow-sm">
      <div>
        {order.stemplerInd ? (
          <>
            <p className="text-[11px] uppercase tracking-wide text-muted">Stemplet ind kl. {formatTime(order.stemplerInd)}</p>
            <p className="font-mono text-2xl text-brand">{hh}:{mm}:{ss}</p>
          </>
        ) : (
          <>
            <p className="text-[11px] uppercase tracking-wide text-muted">Ikke stemplet ind</p>
            <p className="font-mono text-2xl text-ink">{formatDuration(totalMinutes(order))}</p>
          </>
        )}
      </div>
      {order.stemplerInd ? (
        <button onClick={onClockOut} disabled={locked} className="px-5 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">{locked && <Lock size={13} aria-hidden="true" />} Stemplet ud</button>
      ) : (
        <button onClick={onClockIn} disabled={locked} className="px-5 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-success hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">{locked && <Lock size={13} aria-hidden="true" />} Stemplet ind</button>
      )}
    </div>
  );
}

// Simpel underskrifts-pad tegnet direkte på et <canvas> - ingen ekstern
// afhængighed nødvendig. Understøtter både mus (desktop) og touch
// (mobil/tablet, hvor den reelt skal bruges af montøren ved aflevering).
// Canvas' pixel-størrelse sættes ud fra beholderens bredde ved opsætning
// og ved vinduesændring, så tegnepositioner altid matcher pege-positionen
// præcist (i stedet for at skalere med CSS, som ville kræve omregning).
function SignaturePad({ defaultName, onSave, onCancel }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [name, setName] = useState(defaultName || "");

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    const setSize = () => {
      const w = Math.max(280, wrapper.clientWidth);
      canvas.width = w;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    setSize();
    window.addEventListener("resize", setSize);
    return () => window.removeEventListener("resize", setSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = "#1A1A1A";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
    if (!hasDrawn) setHasDrawn(true);
  };
  const end = () => { drawingRef.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const save = () => {
    if (!hasDrawn || !name.trim()) return;
    onSave({ navn: name.trim(), data: canvasRef.current.toDataURL("image/png") });
  };

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <label className="text-xs text-muted block mb-2">
        Navn på den der kvitterer
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx kundens navn" className="w-full mt-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
      </label>
      <p className="text-[11px] text-muted mb-1.5">Skriv under i feltet nedenfor:</p>
      <div ref={wrapperRef} className="w-full">
        <canvas
          ref={canvasRef}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          className="w-full rounded-lg border border-line"
          style={{ touchAction: "none" }}
        />
      </div>
      {!hasDrawn && <p className="text-[11px] text-danger mt-1.5">Der skal skrives under, før den kan gemmes.</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={save} disabled={!hasDrawn || !name.trim()} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-50">Gem underskrift</button>
        <button onClick={clear} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors">Ryd</button>
        {onCancel && <button onClick={onCancel} className="px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted transition-colors">Annuller</button>}
      </div>
    </div>
  );
}

// Kundekvittering ved aflevering. Er allerede underskrevet, vises den
// gemte underskrift + hvem der kvitterede og hvornår - med mulighed for at
// underskrive igen (fx hvis der var en fejl, eller kunden ombestemmer sig
// om hvem der kvitterer). RETTET (august 2026): onSave kan nu være
// undefined (mangler sag_feltarbejde) - så vises kvitteringen kun
// læsende, uden mulighed for at underskrive/genunderskrive.
//
// BEMÆRK: underskriften ligger fortsat som base64 i sagen (order.underskrift)
// og er IKKE flyttet til vedhæftningslaget endnu, i modsætning til
// billederne ovenfor. Det er et bevidst valg om rækkefølge, ikke en
// forglemmelse: en underskrift er ét lille PNG (typisk under 50 KB), mens
// billederne var det, der gjorde en enkelt sag 2,5 MB stor. Flytningen af
// underskriften bør ske sammen med, at de gamle base64-billeder migreres.
function Signature({ order, onSave }) {
  const existing = order.underskrift;
  const [signing, setSigning] = useState(!existing && !!onSave);

  if (!onSave && !existing) {
    return <LockedNotice text="Du kan ikke tage imod en kundeunderskrift på denne sag." />;
  }

  if (!signing && existing) {
    return (
      <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-ink">Kvitteret af {existing.navn}</p>
            <p className="text-[11px] text-muted">{existing.tid}</p>
          </div>
          {onSave && <button onClick={() => setSigning(true)} className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand underline shrink-0 py-2 px-1 focus:outline-none focus:ring-2 focus:ring-brand rounded">Underskriv igen</button>}
        </div>
        <img src={existing.data} alt={`Underskrift fra ${existing.navn}`} className="w-full max-w-sm rounded-lg border border-line bg-white" />
      </div>
    );
  }

  return (
    <SignaturePad
      defaultName={existing?.navn || ""}
      onSave={(payload) => { onSave(payload); setSigning(false); }}
      onCancel={existing ? () => setSigning(false) : null}
    />
  );
}

export { LineItemDetails, Notes, Photos, Reports, TimeLog, ClockWidget, Signature };
