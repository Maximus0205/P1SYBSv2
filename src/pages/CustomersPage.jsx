import React, { useMemo, useState } from "react";
import { Search, Users, Archive, X, ChevronDown } from "lucide-react";
import { OrderCardCompact } from "../components/OrderCardCompact";

const norm = (s) => (s || "").toString().toLowerCase();

// Grupperer alle ordrer pr. kunde. Matcher på telefonnummer (mest
// pålideligt, normaliseret uden mellemrum/tegn) hvis det findes, ellers på
// eksakt (case-insensitive) navn - samme tilgang som kundeopslaget i
// bookingflowet (se CustomerHistory i OrderFormFields.jsx). Navn/telefon på
// selve kunde-rækken hentes fra den SENESTE sag, så evt. rettelser (nyt
// telefonnummer, stavefejl rettet) vises fremfor det ældste data.
function groupByCustomer(orders) {
  const map = new Map();
  for (const o of orders) {
    const phoneDigits = (o.kunde?.telefon || "").replace(/\D/g, "");
    const name = (o.kunde?.navn || "").trim();
    if (!phoneDigits && !name) continue;
    const key = phoneDigits.length >= 6 ? `p:${phoneDigits}` : `n:${name.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, { key, navn: name, telefon: o.kunde?.telefon || "", adresser: new Set(), orders: [], latestDato: "" });
    }
    const c = map.get(key);
    c.orders.push(o);
    if (o.kunde?.adresse) c.adresser.add(o.kunde.adresse);
    if (o.dato >= c.latestDato) {
      c.latestDato = o.dato;
      if (name) c.navn = name;
      if (o.kunde?.telefon) c.telefon = o.kunde.telefon;
    }
  }
  return [...map.values()]
    .map((c) => ({ ...c, adresser: [...c.adresser], orders: c.orders.sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start)) }))
    .sort((a, b) => b.latestDato.localeCompare(a.latestDato));
}

function matchesCustomerSearch(customer, search) {
  const s = norm(search);
  if (!s) return true;
  return (
    norm(customer.navn).includes(s) ||
    norm(customer.telefon).replace(/\s/g, "").includes(s.replace(/\s/g, "")) ||
    customer.adresser.some((a) => norm(a).includes(s)) ||
    customer.orders.some((o) => norm(o.nr).includes(s) || norm(o.ordrenummer).includes(s))
  );
}

// Samme matchelogik som søgningen i Planlægning - sagsnr, ordre-/faktura-
// nummer, telefon, adresse og kundenavn.
function matchesOrderSearch(order, search) {
  const s = norm(search);
  if (!s) return true;
  return (
    norm(order.nr).includes(s) ||
    norm(order.ordrenummer).includes(s) ||
    norm(order.kunde?.navn).includes(s) ||
    norm(order.kunde?.telefon).replace(/\s/g, "").includes(s.replace(/\s/g, "")) ||
    norm(order.kunde?.adresse).includes(s)
  );
}

// Én kunde-række, sammenklappelig - viser al historik for kunden når man
// trykker på den, uden at skulle oprette en ny sag først.
function CustomerRow({ customer, technicians, onOpen }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#D8D0BE] bg-white">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-3 flex items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[#1C232E] truncate">{customer.navn || "Uden navn"}</p>
          <p className="text-xs text-[#52697E] truncate">
            {customer.telefon}
            {customer.telefon && customer.adresser[0] ? " · " : ""}
            {customer.adresser[0]}
            {customer.adresser.length > 1 ? ` (+${customer.adresser.length - 1} adresse${customer.adresser.length > 2 ? "r" : ""})` : ""}
          </p>
        </div>
        <span className="text-xs font-mono px-1.5 py-0.5 border border-[#D8D0BE] text-[#52697E] shrink-0">{customer.orders.length} {customer.orders.length === 1 ? "sag" : "sager"}</span>
        <ChevronDown size={16} className={`text-[#52697E] transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-3 pt-0 grid gap-2 sm:grid-cols-2">
          {customer.orders.map((o) => <OrderCardCompact key={o.id} order={o} technicians={technicians} onOpen={onOpen} onCycleStatus={() => {}} />)}
        </div>
      )}
    </div>
  );
}

// To visninger i én fane, i stedet for to separate faner i navigationen:
//  - "Kunder": grupperet pr. kunde, til at slå EN kunde op og se al historik.
//  - "Arkiv": fladt, kronologisk over ALLE sager, til at slå en enkelt sag
//    op uden at kende kunden (fx kun et sagsnummer eller en adresse).
// Arkivet vises kun i småbidder ad gangen (30 ad gangen) - med potentielt
// hundredvis af gamle sager ville et fuldt render af det hele på én gang
// gøre siden tung at scrolle på mobil.
function CustomersPage({ orders, technicians, onOpen }) {
  const [view, setView] = useState("kunder");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);

  const customers = useMemo(() => groupByCustomer(orders), [orders]);
  const filteredCustomers = useMemo(() => customers.filter((c) => matchesCustomerSearch(c, search)), [customers, search]);

  const archiveOrders = useMemo(
    () => [...orders].filter((o) => matchesOrderSearch(o, search)).sort((a, b) => (b.dato + b.start).localeCompare(a.dato + a.start)),
    [orders, search]
  );

  const changeSearch = (val) => { setSearch(val); setVisibleCount(30); };

  return (
    <div>
      <p className="font-mono text-[11px] tracking-widest uppercase text-[#E2621B] mb-1">Overblik</p>
      <h1 className="font-['Barlow_Condensed'] text-4xl uppercase tracking-tight text-[#1C232E] mb-1">Kunder</h1>
      <p className="text-sm text-[#52697E] mb-4">Slå en kunde op og se al historik, eller søg direkte i arkivet over alle sager.</p>

      <div className="flex border border-[#D8D0BE] mb-4 text-xs font-semibold uppercase tracking-wide w-fit">
        <button onClick={() => setView("kunder")} className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${view === "kunder" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}><Users size={13} /> Kunder</button>
        <button onClick={() => setView("arkiv")} className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${view === "arkiv" ? "bg-[#1C232E] text-white" : "text-[#52697E] hover:text-[#1C232E]"}`}><Archive size={13} /> Arkiv</button>
      </div>

      <div className="relative mb-6">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52697E]" />
        <input
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
          placeholder={view === "kunder" ? "Søg efter navn, telefon eller adresse..." : "Søg efter sagsnr., ordre-/fakturanr., telefon, adresse eller kundenavn..."}
          className="w-full border border-[#D8D0BE] bg-white pl-9 pr-9 py-2.5 text-sm text-[#1C232E] focus:outline-none focus:border-[#E2621B]"
        />
        {search && (
          <button onClick={() => changeSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#52697E] hover:text-[#E2621B]">
            <X size={16} />
          </button>
        )}
      </div>

      {view === "kunder" ? (
        <div>
          <p className="text-xs text-[#52697E] mb-3">{filteredCustomers.length} {filteredCustomers.length === 1 ? "kunde" : "kunder"}{search ? ` matcher "${search}"` : " i alt"}</p>
          {filteredCustomers.length === 0 ? (
            <p className="text-sm text-[#52697E] italic">Ingen kunder matcher søgningen.</p>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((c) => <CustomerRow key={c.key} customer={c} technicians={technicians} onOpen={onOpen} />)}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-xs text-[#52697E] mb-3">{archiveOrders.length} {archiveOrders.length === 1 ? "sag" : "sager"}{search ? ` matcher "${search}"` : " i alt, nyeste først"}</p>
          {archiveOrders.length === 0 ? (
            <p className="text-sm text-[#52697E] italic">Ingen sager matcher søgningen.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {archiveOrders.slice(0, visibleCount).map((o) => <OrderCardCompact key={o.id} order={o} technicians={technicians} onOpen={onOpen} onCycleStatus={() => {}} />)}
              </div>
              {archiveOrders.length > visibleCount && (
                <button onClick={() => setVisibleCount((v) => v + 30)} className="mt-4 w-full py-2.5 text-xs font-semibold uppercase tracking-wide text-[#1C232E] border border-[#D8D0BE] hover:border-[#E2621B] hover:text-[#E2621B] transition-colors">
                  Vis flere ({archiveOrders.length - visibleCount} tilbage)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { CustomersPage };
