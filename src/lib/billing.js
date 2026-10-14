// BACKOFFICE: abonnement, forbrug, grænser og fakturaer (oktober 2026). Kun for systemadmin.
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
export const hentAlleGraenser = () => koer(() => supabase.from("billing_limits").select("store_id, metric, advarsel_ved, spaerr_ved"));

export const hentIndstillinger = () => koer(() => supabase.from("billing_settings").select("*").eq("singleton", true).maybeSingle());
export const gemIndstillinger = (felter) => koer(() => supabase.from("billing_settings").update({ ...felter, updated_at: new Date().toISOString() }).eq("singleton", true));

export async function hentPlaner() {
  const [p, pr] = await Promise.all([
    koer(() => supabase.from("billing_plans").select("*").order("created_at")),
    koer(() => supabase.from("billing_plan_prices").select("*")),
  ]);
  if (!p.ok) return p;
  if (!pr.ok) return pr;
  return { ok: true, data: (p.data || []).map((pl) => ({ ...pl, priser: (pr.data || []).filter((x) => x.plan_id === pl.id) })) };
}
export async function gemPlan(plan, priser) {
  const raekke = { navn: plan.navn, beskrivelse: plan.beskrivelse || "", maanedspris_ore: plan.maanedspris_ore, inkl_brugere: plan.inkl_brugere, inkl_biler: plan.inkl_biler, pris_ekstra_bil_ore: plan.pris_ekstra_bil_ore, pris_ekstra_bruger_ore: plan.pris_ekstra_bruger_ore, aktiv: plan.aktiv !== false };
  const r = plan.id
    ? await koer(() => supabase.from("billing_plans").update(raekke).eq("id", plan.id).select("id").single())
    : await koer(() => supabase.from("billing_plans").insert(raekke).select("id").single());
  if (!r.ok) return r;
  const id = r.data.id;
  const medPris = priser.filter((x) => x.enhedspris_ore > 0 || x.inkluderet > 0);
  if (medPris.length) {
    const u = await koer(() => supabase.from("billing_plan_prices").upsert(medPris.map((x) => ({ plan_id: id, metric: x.metric, inkluderet: x.inkluderet, enhedspris_ore: x.enhedspris_ore })), { onConflict: "plan_id,metric" }));
    if (!u.ok) return u;
  }
  const tomme = priser.filter((x) => !(x.enhedspris_ore > 0 || x.inkluderet > 0)).map((x) => x.metric);
  if (tomme.length) {
    const d = await koer(() => supabase.from("billing_plan_prices").delete().eq("plan_id", id).in("metric", tomme));
    if (!d.ok) return d;
  }
  return { ok: true, id };
}

export const hentKonto = (storeId) => koer(() => supabase.from("billing_accounts").select("*").eq("store_id", storeId).maybeSingle());
export const gemKonto = (konto) => koer(() => supabase.from("billing_accounts").upsert({ ...konto, updated_at: new Date().toISOString() }, { onConflict: "store_id" }));
export const hentGraenser = (storeId) => koer(() => supabase.from("billing_limits").select("*").eq("store_id", storeId));
export async function gemGraense(storeId, metric, advarsel, spaerr) {
  if (advarsel === null && spaerr === null) return koer(() => supabase.from("billing_limits").delete().eq("store_id", storeId).eq("metric", metric));
  return koer(() => supabase.from("billing_limits").upsert({ store_id: storeId, metric, advarsel_ved: advarsel, spaerr_ved: spaerr }, { onConflict: "store_id,metric" }));
}

export const hentFakturaer = () => koer(() => supabase.from("billing_invoices").select("id, fakturanr, store_id, periode_fra, periode_til, status, udstedt_dato, forfaldsdato, betalt_dato, kunde, total_ore, netto_ore, moms_ore, created_at").order("created_at", { ascending: false }));
export async function hentFaktura(id) {
  const [f, l] = await Promise.all([
    koer(() => supabase.from("billing_invoices").select("*").eq("id", id).single()),
    koer(() => supabase.from("billing_invoice_lines").select("*").eq("invoice_id", id).order("raekke")),
  ]);
  if (!f.ok) return f;
  if (!l.ok) return l;
  return { ok: true, data: { ...f.data, linjer: l.data || [] } };
}
export const opretKladde = (storeId, fra, til) => koer(() => supabase.rpc("billing_opret_kladde", { p_store: storeId, p_fra: fra, p_til: til }));
export const udstedFaktura = (id) => koer(() => supabase.rpc("billing_udsted", { p_id: id }));
export const saetFakturaStatus = (id, status, dato = null) => koer(() => supabase.rpc("billing_saet_status", { p_id: id, p_status: status, p_dato: dato }));
