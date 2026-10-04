import React, { useCallback, useEffect, useState } from "react";
import { Trash2, RotateCcw, Loader2, X } from "lucide-react";
import { buildTitle } from "../data/domain";
import { fetchTrashedOrders, canDeleteOrders, restoreOrder, purgeTrashedOrder, notifyOrdersChanged } from "../lib/orderStore";
import { tidTekst } from "../lib/orderDrafts";

// PAPIRKURV (oktober 2026): sager der er slettet, men endnu kan hentes tilbage -
// med noter, billeder, rapporter og registreret tid. Se
// supabase/migrations/20261004_order_trash.sql.
//
// Kun brugere med rettigheden sag_slet (admin og sælger) kan gendanne og slette
// endeligt. Databasen håndhæver det; her vises blot en venlig besked i stedet for
// knapper, der kun ville give en fejl. "Slet endeligt" kræver et ekstra tryk og
// kan ikke fortrydes.
function TrashPanel({ storeId, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fejl, setFejl] = useState(null);
  const [maaGerne, setMaaGerne] = useState(null);
  const [travl, setTravl] = useState(null);
  const [bekraeft, setBekraeft] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setFejl(null);
    const [ret, res] = await Promise.all([canDeleteOrders(), fetchTrashedOrders(storeId)]);
    setMaaGerne(ret);
    if (!res.ok) {
      setFejl(res.netvaerk ? "Ingen forbindelse – papirkurven kunne ikke hentes." : "Papirkurven kunne ikke hentes. Prøv igen om lidt.");
    } else {
      setRows(res.rows);
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const fejltekst = (r, handling) => (r.status === "network"
    ? `Ingen forbindelse – sagen blev ikke ${handling}.`
    : `Sagen blev ikke ${handling}. ${r.fejl || ""}`.trim());

  const gendan = async (row) => {
    setTravl(row.id); setFejl(null);
    const r = await restoreOrder(storeId, row.id);
    setTravl(null);
    // not_found: en anden har allerede gendannet eller slettet den - listen er forældet.
    if (r.status === "ok" || r.status === "not_found") {
      setRows((prev) => prev.filter((x) => x.id !== row.id));
      notifyOrdersChanged();
    } else {
      setFejl(fejltekst(r, "gendannet"));
    }
  };

  const sletEndeligt = async (row) => {
    setTravl(row.id); setFejl(null); setBekraeft(null);
    const r = await purgeTrashedOrder(storeId, row.id);
    setTravl(null);
    if (r.status === "ok" || r.status === "not_found") {
      setRows((prev) => prev.filter((x) => x.id !== row.id));
    } else {
      setFejl(fejltekst(r, "slettet"));
    }
  };

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm mb-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink flex items-center gap-1.5">
          <Trash2 size={14} aria-hidden="true" /> Papirkurv
        </h3>
        <button type="button" onClick={onClose} aria-label="Luk papirkurv" className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-lg text-muted hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="text-xs text-muted mb-3">Slettede sager gemmes her med noter, billeder og registreret tid, så de kan hentes tilbage.</p>

      {fejl && <p role="alert" className="text-xs text-danger mb-3">{fejl}</p>}

      {loading ? (
        <p className="text-sm text-muted flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Henter papirkurven...</p>
      ) : maaGerne === false ? (
        <p className="text-sm text-muted italic">Du har ikke rettighed til at se eller gendanne slettede sager. Kontakt en administrator.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted italic">Papirkurven er tom.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const o = row.data || {};
            const sikker = bekraeft === row.id;
            const optaget = travl === row.id;
            return (
              <li key={row.id} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-muted">#{o.nr || "—"}{o.dato ? ` · ${o.dato}` : ""}</p>
                    <p className="text-sm font-semibold text-ink truncate">{o.kunde?.navn || "Uden navn"}{o.kunde?.adresse ? ` · ${o.kunde.adresse}` : ""}</p>
                    <p className="text-xs text-muted truncate">{buildTitle(o.varelinjer || [])}</p>
                    <p className="text-[11px] text-muted mt-0.5">Slettet {tidTekst(row.deleted_at)}</p>
                  </div>
                  {sikker ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-danger font-semibold">Slet endeligt? Kan ikke fortrydes.</span>
                      <button type="button" onClick={() => sletEndeligt(row)} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-danger hover:bg-ink focus:outline-none focus:ring-2 focus:ring-ink">Ja, slet endeligt</button>
                      <button type="button" onClick={() => setBekraeft(null)} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:border-muted focus:outline-none focus:ring-2 focus:ring-muted">Fortryd</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => gendan(row)} disabled={optaget} className="min-h-[44px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors disabled:opacity-60 flex items-center gap-1.5">
                        {optaget ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />} Gendan
                      </button>
                      <button type="button" onClick={() => setBekraeft(row.id)} disabled={optaget} aria-label={`Slet sag ${o.nr || ""} endeligt`} className="min-h-[44px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-danger disabled:opacity-60">Slet endeligt</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { TrashPanel };
