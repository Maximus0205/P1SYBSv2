import React, { useState, useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { formatTime, formatDuration, now, totalMinutes, lineItemLabel, serviceIcon } from "../data/domain";

function LineItemDetails({ order, onToggleAddOn, onAddAddOn, onRemoveAddOn }) {
  const [newItem, setNewItem] = useState({});
  return (
    <div className="bg-white border border-[#D8D0BE] p-4 mb-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1C232E] mb-3">Varelinjer, ydelser & opmærksomhedspunkter</h3>
      <div className="space-y-4">
        {order.varelinjer.map((v) => {
          const addOns = v.tillaeg || [];
          const missing = addOns.filter((y) => !y.udfoert).length;
          return (
            <div key={v.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <p className="text-sm font-semibold text-[#1C232E]">{lineItemLabel(v)}</p>
                  {v.primaerYdelse && <p className="text-[11px] text-[#52697E]">{v.primaerYdelse.navn}</p>}
                </div>
                {missing > 0 && <span className="font-mono text-[11px] text-[#E2621B]">{missing} mangler</span>}
              </div>
              {addOns.length === 0 ? (
                <p className="text-xs text-[#52697E] italic mb-1">Ingen tillægsydelser/punkter for denne varelinje.</p>
              ) : (
                <div className="space-y-1 mb-1">
                  {addOns.map((y) => {
                    const Icon = serviceIcon(y.navn);
                    return (
                      <label key={y.id} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-[#F3EFE6] cursor-pointer group">
                        <input type="checkbox" checked={y.udfoert} onChange={() => onToggleAddOn(v.id, y.id)} className="w-4 h-4 accent-[#3D7A5C]" />
                        <Icon size={14} className="text-[#52697E] shrink-0" strokeWidth={2.5} />
                        <span className="text-sm flex-1" style={{ textDecoration: y.udfoert ? "line-through" : "none", color: y.udfoert ? "#52697E" : "#1C232E" }}>{y.navn}</span>
                        <button onClick={(e) => { e.preventDefault(); onRemoveAddOn(v.id, y.id); }} className="opacity-0 group-hover:opacity-100 text-[#52697E] hover:text-[#E2621B]"><X size={14} /></button>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 pl-2">
                <input
                  value={newItem[v.id] || ""}
                  onChange={(e) => setNewItem((p) => ({ ...p, [v.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && (newItem[v.id] || "").trim()) { onAddAddOn(v.id, newItem[v.id].trim()); setNewItem((p) => ({ ...p, [v.id]: "" })); } }}
                  placeholder="Tilføj punkt..."
                  className="flex-1 border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-1.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
                />
                <button onClick={() => { if (!(newItem[v.id] || "").trim()) return; onAddAddOn(v.id, newItem[v.id].trim()); setNewItem((p) => ({ ...p, [v.id]: "" })); }} className="px-3 text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B] transition-colors"><Plus size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Notes({ order, onAdd }) {
  const [text, setText] = useState("");
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv en note om sagen..." rows={2} className="flex-1 border border-[#D8D0BE] bg-white px-3 py-2 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B] resize-none" />
        <button onClick={() => { if (!text.trim()) return; onAdd(text); setText(""); }} className="px-4 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors">Tilføj</button>
      </div>
      {order.noter.length === 0 ? <p className="text-sm text-[#52697E] italic">Ingen noter endnu for denne sag.</p> : (
        <div className="space-y-2">
          {[...order.noter].reverse().map((n) => (
            <div key={n.id} className="border-l-2 border-[#E2621B] bg-white px-3 py-2">
              <p className="text-sm text-[#1C232E]">{n.tekst}</p>
              <p className="font-mono text-[11px] text-[#52697E] mt-1">{n.tid}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Photos({ order, onAdd }) {
  const inputRef = useRef(null);
  const handleFiles = (files) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => onAdd({ src: reader.result, navn: file.name });
      reader.readAsDataURL(file);
    });
  };
  return (
    <div>
      <div onClick={() => inputRef.current?.click()} className="mb-4 border border-dashed border-[#D8D0BE] hover:border-[#E2621B] transition-colors bg-white p-6 text-center cursor-pointer">
        <p className="text-sm text-[#52697E]">Tryk for at tilføje billeder fra sagen</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      </div>
      {order.billeder.length === 0 ? <p className="text-sm text-[#52697E] italic">Ingen billeder endnu for denne sag.</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {order.billeder.map((b) => (
            <div key={b.id} className="border border-[#D8D0BE] bg-white">
              <img src={b.src} alt={b.navn} className="w-full h-32 object-cover" />
              <p className="text-[11px] text-[#52697E] px-2 py-1 truncate">{b.navn}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[#52697E] mt-3">Billeder gemmes kun i denne session og forsvinder ved genindlæsning.</p>
    </div>
  );
}

function Reports({ order, onAdd }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  return (
    <div>
      <div className="border border-[#D8D0BE] bg-white p-4 mb-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rapporttitel, fx 'Afleveringsrapport'" className="w-full border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] mb-2 focus:outline-none focus:border-[#E2621B]" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Beskrivelse af udført arbejde..." rows={3} className="w-full border border-[#D8D0BE] bg-[#F3EFE6] px-3 py-2 text-sm text-[#1C232E] mb-2 focus:outline-none focus:border-[#E2621B] resize-none" />
        <button onClick={() => { if (!title.trim() || !text.trim()) return; onAdd(title, text); setTitle(""); setText(""); }} className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white bg-[#1C232E] hover:bg-[#E2621B] transition-colors">Gem rapport</button>
      </div>
      {order.rapporter.length === 0 ? <p className="text-sm text-[#52697E] italic">Ingen rapporter endnu for denne sag.</p> : (
        <div className="space-y-2">
          {[...order.rapporter].reverse().map((r) => (
            <div key={r.id} className="border border-[#D8D0BE] bg-white p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-sm text-[#1C232E]">{r.titel}</p>
                <p className="font-mono text-[11px] text-[#52697E]">{r.tid}</p>
              </div>
              <p className="text-sm text-[#52697E]">{r.tekst}</p>
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
      <div className="border border-[#D8D0BE] bg-white p-4 mb-4 flex items-center justify-between">
        <span className="text-sm text-[#52697E]">Samlet registreret tid</span>
        <span className="font-mono text-lg text-[#1C232E]">{formatDuration(mins)}</span>
      </div>
      {order.logs.length === 0 ? <p className="text-sm text-[#52697E] italic">Ingen stemplinger registreret endnu.</p> : (
        <div className="space-y-2">
          {[...order.logs].reverse().map((l) => (
            <div key={l.id} className="border border-[#D8D0BE] bg-white p-3 flex items-center justify-between">
              <span className="font-mono text-sm text-[#1C232E]">{formatTime(l.ind)} → {formatTime(l.ud)}</span>
              <span className="font-mono text-sm text-[#52697E]">{formatDuration(l.minutter)}</span>
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

  return (
    <div className="flex items-center justify-between border border-[#D8D0BE] bg-white p-4 mb-5">
      <div>
        {order.stemplerInd ? (
          <>
            <p className="text-[11px] uppercase tracking-wide text-[#52697E]">Stemplet ind kl. {formatTime(order.stemplerInd)}</p>
            <p className="font-mono text-2xl text-[#E2621B]">{hh}:{mm}:{ss}</p>
          </>
        ) : (
          <>
            <p className="text-[11px] uppercase tracking-wide text-[#52697E]">Ikke stemplet ind</p>
            <p className="font-mono text-2xl text-[#1C232E]">{formatDuration(totalMinutes(order))}</p>
          </>
        )}
      </div>
      {order.stemplerInd ? (
        <button onClick={onClockOut} className="px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-white bg-[#E2621B] hover:bg-[#1C232E] transition-colors">Stemplet ud</button>
      ) : (
        <button onClick={onClockIn} className="px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-white bg-[#3D7A5C] hover:bg-[#1C232E] transition-colors">Stemplet ind</button>
      )}
    </div>
  );
}

export { LineItemDetails, Notes, Photos, Reports, TimeLog, ClockWidget };
