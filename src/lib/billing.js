// BACKOFFICE: produkter, kunder, abonnementer, forbrug, priser og fakturaer (oktober 2026). Kun for systemadmin.
//
// ALT beregnes og håndhæves i databasen (funktioner billing_* i Supabase) - her er kun adgang til dem og rene hjælpere til visning/indtastning.
// Databasen afviser selv alle kald fra andre end systemadmin (RLS + tjek i hver funktion), så skjulte faner i brugerfladen er ikke sikkerheden.
// Beløb gemmes som hele øre (enhedspriser må have decimaler, fx 35,5 øre pr. SMS). Moms, fakturanumre og låsning af udstedte fakturaer styres af databasen.
import { supabase } from "./supabaseClient";

export * from "./billingHelpers";

// ---- Databaseadgang (alt returnerer { ok, ... } og kaster aldrig) -------------------------------------------------------------------
const fejlTekst = (error) => (error && error.message ? String(error.message) : "Ukendt fejl.");
async function koer(fn) {
  try { const { data, error } = await fn(); if (error) return { ok: false, fejl: fejlTekst(error) }; return { ok: true, data }; } catch (e) { return { ok: false, fejl: "Forbindelsen fejlede. Prøv igen." }; }
}

export const hentOverblik = (fra, til) => koer(() => supabase.rpc("billing_overblik", { p_fra: fra, p_til: til }));
export const hentUdenAbonnement = () => koer(() => supabase.rpc("billing_p1_uden_abonnement"));
export const beregnAbonnement = (aboId, fra, til) => koer(() => supabase.rpc("billing_beregn_abonnement", { p_sub: aboId, p_fra: fra, p_til: til }));
export const hentAlleGraenser = () => koer(() => supabase.from("billing_abo_graenser").select("subscription_id, metric, advarsel_ved, spaerr_ved"));
export const hentGraenser = (aboId) => koer(() => supabase.from("billing_abo_graenser").select("*").eq("subscription_id", aboId));
export async function gemGraense(aboId, metric, advarsel, spaerr) {
  if (advarsel === null && spaerr === null) return koer(() => supabase.from("billing_abo_graenser").delete().eq("subscription_id", aboId).eq("metric", metric));
  return koer(() => supabase.from("billing_abo_graenser").upsert({ subscription_id: aboId, metric, advarsel_ved: advarsel, spaerr_ved: spaerr }, { onConflict: "subscription_id,metric" }));
}

export const hentIndstillinger = () => koer(() => supabase.from("billing_settings").select("*").eq("singleton", true).maybeSingle());
export const gemIndstillinger = (felter) => koer(() => supabase.from("billing_settings").update({ ...felter, updated_at: new Date().toISOString() }).eq("singleton", true));

// ---- Produkter og målepunkter --------------------------------------------------------------------------------------------------
export async function hentProdukter() {
  const [p, m] = await Promise.all([
    koer(() => supabase.from("billing_products").select("*").order("created_at")),
    koer(() => supabase.from("billing_product_metrics").select("*").order("raekkefoelge").order("kode")),
  ]);
  if (!p.ok) return p;
  if (!m.ok) return m;
  return { ok: true, data: (p.data || []).map((x) => ({ ...x, maalepunkter: (m.data || []).filter((y) => y.product_id === x.id) })) };
}
export const gemProdukt = (p) => {
  const raekke = { navn: p.navn, beskrivelse: p.beskrivelse || "", aktiv: p.aktiv !== false };
  return p.id ? koer(() => supabase.from("billing_products").update(raekke).eq("id", p.id).select("id").single()) : koer(() => supabase.from("billing_products").insert({ ...raekke, kode: p.kode }).select("id").single());
};
export const gemMaalepunkt = (productId, m) => koer(() => supabase.from("billing_product_metrics").upsert({
  product_id: productId, kode: m.kode, navn: m.navn, enhed: m.enhed || "stk.", art: m.art, indkoeb_ore: m.indkoeb_ore, paaslag_ore: m.paaslag_ore, spaerbar: m.art === "forbrug" && !!m.spaerbar, raekkefoelge: m.raekkefoelge ?? 0,
}, { onConflict: "product_id,kode" }));

// ---- Prisplaner (hører til et produkt) -----------------------------------------------------------------------------------------------
export async function hentPlaner() {
  const [p, pr] = await Promise.all([
    koer(() => supabase.from("billing_plans").select("*").order("created_at")),
    koer(() => supabase.from("billing_plan_prices").select("*")),
  ]);
  if (!p.ok) return p;
  if (!pr.ok) return pr;
  return { ok: true, data: (p.data || []).map((pl) => ({ ...pl, priser: (pr.data || []).filter((x) => x.plan_id === pl.id) })) };
}
// priser: [{ metric, inkluderet, enhedspris_ore (null = standardpris), enhed_stoerrelse }] - kun de målepunkter, der skal være med i planen
export async function gemPlan(plan, priser, alleMetrics) {
  const raekke = { navn: plan.navn, beskrivelse: plan.beskrivelse || "", maanedspris_ore: plan.maanedspris_ore, aktiv: plan.aktiv !== false };
  const r = plan.id
    ? await koer(() => supabase.from("billing_plans").update(raekke).eq("id", plan.id).select("id").single())
    : await koer(() => supabase.from("billing_plans").insert({ ...raekke, product_id: plan.product_id }).select("id").single());
  if (!r.ok) return r;
  const id = r.data.id;
  if (priser.length) {
    const u = await koer(() => supabase.from("billing_plan_prices").upsert(priser.map((x) => ({ plan_id: id, metric: x.metric, inkluderet: x.inkluderet, enhedspris_ore: x.enhedspris_ore, enhed_stoerrelse: x.enhed_stoerrelse })), { onConflict: "plan_id,metric" }));
    if (!u.ok) return u;
  }
  const bort = (alleMetrics || []).filter((m) => !priser.some((x) => x.metric === m));
  if (bort.length) {
    const d = await koer(() => supabase.from("billing_plan_prices").delete().eq("plan_id", id).in("metric", bort));
    if (!d.ok) return d;
  }
  return { ok: true, id };
}

// ---- Kunder og abonnementer ----------------------------------------------------------------------------------------------------------
export const hentKunder = () => koer(() => supabase.from("billing_customers").select("*").order("navn"));
export const gemKunde = (k) => {
  const { id, ...felter } = k;
  const raekke = { ...felter, updated_at: new Date().toISOString() };
  return id ? koer(() => supabase.from("billing_customers").update(raekke).eq("id", id).select("id").single()) : koer(() => supabase.from("billing_customers").insert(raekke).select("id").single());
};
export const hentAbonnementer = () => koer(() => supabase.from("billing_subscriptions").select("*").order("created_at"));
export const gemAbonnement = (a) => {
  const { id, ...felter } = a;
  const raekke = { ...felter, updated_at: new Date().toISOString() };
  return id ? koer(() => supabase.from("billing_subscriptions").update(raekke).eq("id", id).select("id").single()) : koer(() => supabase.from("billing_subscriptions").insert(raekke).select("id").single());
};

// ---- Fakturaer -----------------------------------------------------------------------------------------------------------------------
export const hentFakturaer = () => koer(() => supabase.from("billing_invoices").select("id, fakturanr, customer_id, periode_fra, periode_til, status, udstedt_dato, forfaldsdato, betalt_dato, kunde, total_ore, netto_ore, moms_ore, created_at").order("created_at", { ascending: false }));
export async function hentFaktura(id) {
  const [f, l] = await Promise.all([
    koer(() => supabase.from("billing_invoices").select("*").eq("id", id).single()),
    koer(() => supabase.from("billing_invoice_lines").select("*").eq("invoice_id", id).order("raekke")),
  ]);
  if (!f.ok) return f;
  if (!l.ok) return l;
  return { ok: true, data: { ...f.data, linjer: l.data || [] } };
}
export const opretKladde = (kundeId, fra, til) => koer(() => supabase.rpc("billing_opret_faktura_kladde", { p_kunde: kundeId, p_fra: fra, p_til: til }));
export const opretAlleKladder = (fra, til) => koer(() => supabase.rpc("billing_opret_alle_kladder", { p_fra: fra, p_til: til }));
export const udstedFaktura = (id) => koer(() => supabase.rpc("billing_udsted", { p_id: id }));
export const saetFakturaStatus = (id, status, dato = null) => koer(() => supabase.rpc("billing_saet_status", { p_id: id, p_status: status, p_dato: dato }));

// ---- Dashboard og udgifter -----------------------------------------------------------------------------------------------------
export const hentDashboard = (maaneder = 12) => koer(() => supabase.rpc("billing_dashboard", { p_maaneder: maaneder }));
export const hentUdgifter = () => koer(() => supabase.from("billing_costs").select("*").order("dato", { ascending: false }));
export const gemUdgift = (u) => {
  const raekke = { dato: u.dato, tekst: u.tekst, kategori: u.kategori || "", beloeb_ore: u.beloeb_ore, gentag: !!u.gentag, slut_dato: u.gentag && u.slut_dato ? u.slut_dato : null };
  return u.id ? koer(() => supabase.from("billing_costs").update(raekke).eq("id", u.id)) : koer(() => supabase.from("billing_costs").insert(raekke));
};
export const sletUdgift = (id) => koer(() => supabase.from("billing_costs").delete().eq("id", id));

// ---- Kreditnotaer og aktivitetslog ---------------------------------------------------------------------------------------------
export const hentKreditnotaer = () => koer(() => supabase.from("billing_credit_notes").select("id, kreditnr, invoice_id, customer_id, udstedt_dato, kunde, total_ore, aarsag, created_at").order("created_at", { ascending: false }));
export async function hentKreditnota(id) {
  const [c, l] = await Promise.all([
    koer(() => supabase.from("billing_credit_notes").select("*").eq("id", id).single()),
    koer(() => supabase.from("billing_credit_note_lines").select("*").eq("credit_id", id).order("raekke")),
  ]);
  if (!c.ok) return c;
  if (!l.ok) return l;
  const o = await koer(() => supabase.from("billing_invoices").select("fakturanr, udstedt_dato").eq("id", c.data.invoice_id).maybeSingle());
  return { ok: true, data: { ...c.data, linjer: l.data || [], original_nr: o.ok && o.data ? o.data.fakturanr : "" } };
}
export const opretKreditnota = (fakturaId, aarsag) => koer(() => supabase.rpc("billing_opret_kreditnota", { p_faktura: fakturaId, p_aarsag: aarsag }));
export const hentLog = (antal = 200) => koer(() => supabase.from("billing_log").select("*").order("tidspunkt", { ascending: false }).limit(antal));
