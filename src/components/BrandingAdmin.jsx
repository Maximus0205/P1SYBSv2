import React, { useEffect, useMemo, useState } from "react";
import { Palette, Loader2, AlertCircle, Check, Plus, Trash2, Globe, Upload, X, ChevronDown, ChevronUp, Store } from "lucide-react";
import {
  getOrganizations, getStoresBranding, createOrganization, updateOrganization, deleteOrganization,
  addOrganizationDomain, removeOrganizationDomain, updateStoreBranding, uploadLogo, deleteLogoFile, logoUrl,
} from "../lib/branding";
import { DEFAULT_COLORS, COLOR_KEYS, isHexColor, normalizeHostname, resolveBranding } from "../lib/brandingCore";

// KÆDER & BRANDING (oktober 2026) - systemadmin-fane.
//
// Kæden ejer brandingen (logo, farver, visningsnavn) og de domæner, kædens
// login-side vises på. En butik kobles til en kæde og kan valgfrit have sit
// EGET branding, der overskriver kædens (fx Bjerg Iversen i Punkt1).
// Al skrivning håndhæves af RLS (kun systemadmin) - se migrationen
// organizations_and_branding.

const COLOR_LABEL = { brand: "Accent", brand_dark: "Accent (mørk)", ink: "Mørk (topbar/tekst)", paper: "Baggrund" };
const inputCls = "rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand";
const btnPrimary = "px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-brand hover:bg-brand-dark transition-colors flex items-center gap-1.5 disabled:opacity-60";
const btnSecondary = "px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-muted border border-line hover:text-ink transition-colors flex items-center gap-1.5 disabled:opacity-60";

function BrandingAdmin({ onBrandingChanged }) {
  const [orgs, setOrgs] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [openId, setOpenId] = useState(null);

  const reload = async () => {
    const [o, s] = await Promise.all([getOrganizations(), getStoresBranding()]);
    setLoadError(!o.ok ? o.fejl : !s.ok ? s.fejl : "");
    setOrgs(o.data); setStores(s.data); setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const changed = async () => { await reload(); onBrandingChanged?.(); };

  const create = async () => {
    setCreateError("");
    if (!newName.trim()) { setCreateError("Skriv kædens navn."); return; }
    setCreating(true);
    const r = await createOrganization(newName);
    setCreating(false);
    if (!r.ok) { setCreateError(r.fejl); return; }
    setNewName(""); setOpenId(r.id);
    await reload();
  };

  if (loading) return <p className="text-sm text-muted">Indlæser...</p>;

  const storesWithoutOrg = stores.filter((s) => !s.organization_id);

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink mb-1 flex items-center gap-2"><Palette size={16} aria-hidden="true" /> Kæder & branding</h3>
      <p className="text-xs text-muted mb-4">
        Hver kæde har sit eget logo, sine farver og de webadresser, kædens login-side vises på. En butik bruger sin kædes branding,
        men kan få sit eget logo og egne farver, der overskriver kædens.
      </p>
      {loadError && <p role="alert" className="text-xs text-danger mb-3 flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> Kunne ikke hente kæder: {loadError}</p>}

      <div className="rounded-xl border border-line bg-white p-4 mb-4 shadow-sm">
        <label htmlFor="ny-kaede" className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">Opret ny kæde</label>
        <div className="flex gap-2 flex-wrap">
          <input id="ny-kaede" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Kædens navn, fx Punkt1" maxLength={80} className={`${inputCls} flex-1 min-w-[180px]`} />
          <button type="button" onClick={create} disabled={creating} className={btnPrimary}>
            {creating ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />} Opret
          </button>
        </div>
        {createError && <p role="alert" className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> {createError}</p>}
      </div>

      {orgs.length === 0 ? (
        <p className="text-sm text-muted italic mb-4">Ingen kæder oprettet endnu.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {orgs.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              stores={stores}
              open={openId === org.id}
              onToggle={() => setOpenId(openId === org.id ? null : org.id)}
              onChanged={changed}
            />
          ))}
        </div>
      )}

      {storesWithoutOrg.length > 0 && (
        <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Butikker uden kæde ({storesWithoutOrg.length})</h4>
          <div className="space-y-2">
            {storesWithoutOrg.map((s) => <StoreRow key={s.id} store={s} orgs={orgs} org={null} onChanged={changed} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function OrgCard({ org, stores, open, onToggle, onChanged }) {
  const orgStores = stores.filter((s) => s.organization_id === org.id);
  const preview = resolveBranding(org, null);
  return (
    <div className="rounded-xl border border-line bg-white shadow-sm">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left p-3 flex items-center gap-3 min-h-[44px]">
        <span className="w-8 h-8 rounded-lg shrink-0 border border-line" style={{ background: preview.colors.brand }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-sm text-ink truncate">{org.name}</span>
          <span className="block text-xs text-muted truncate">
            {orgStores.length} {orgStores.length === 1 ? "butik" : "butikker"} · {org.domains.length ? org.domains.join(", ") : "intet domæne"}
          </span>
        </span>
        {open ? <ChevronUp size={16} className="text-muted shrink-0" aria-hidden="true" /> : <ChevronDown size={16} className="text-muted shrink-0" aria-hidden="true" />}
      </button>
      {open && (
        <div className="border-t border-divider p-3 sm:p-4 space-y-5">
          <BrandingForm
            key={org.updated_at || org.id}
            title="Kædens branding"
            scope="org"
            ownerId={org.id}
            name={org.name}
            branding={org.branding}
            inherited={null}
            onSave={(fields) => updateOrganization(org.id, fields)}
            onSaved={onChanged}
          />
          <DomainsEditor org={org} onChanged={onChanged} />
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><Store size={13} aria-hidden="true" /> Kædens butikker</h4>
            {orgStores.length === 0 ? (
              <p className="text-xs text-muted italic">Ingen butikker koblet til kæden endnu - vælg kæden på en butik under "Butikker uden kæde".</p>
            ) : (
              <div className="space-y-2">
                {orgStores.map((s) => <StoreRow key={s.id} store={s} orgs={null} org={org} onChanged={onChanged} />)}
              </div>
            )}
          </div>
          <DeleteOrg org={org} storeCount={orgStores.length} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

function DomainsEditor({ org, onChanged }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentHost = typeof window !== "undefined" ? window.location.hostname : "";

  const add = async (raw) => {
    setError("");
    const host = normalizeHostname(raw);
    if (!host) { setError("Skriv et gyldigt domæne, fx bjergiversen.dk."); return; }
    setBusy(true);
    const r = await addOrganizationDomain(org.id, host);
    setBusy(false);
    if (!r.ok) { setError(r.fejl); return; }
    setValue("");
    onChanged();
  };
  const remove = async (host) => {
    setBusy(true);
    const r = await removeOrganizationDomain(host);
    setBusy(false);
    if (!r.ok) { setError(r.fejl); return; }
    onChanged();
  };

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1 flex items-center gap-1.5"><Globe size={13} aria-hidden="true" /> Webadresser (login-side)</h4>
      <p className="text-xs text-muted mb-2">Login-siden viser kædens logo, når systemet åbnes på en af disse adresser. Domænet skal også pege på systemets hosting.</p>
      {org.domains.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-2">
          {org.domains.map((h) => (
            <li key={h} className="flex items-center gap-1 rounded-full border border-line bg-panel pl-3 pr-1 py-1 text-xs font-mono text-ink">
              {h}
              <button type="button" onClick={() => remove(h)} disabled={busy} aria-label={`Fjern ${h}`} className="p-1.5 rounded-full text-muted hover:text-danger"><X size={12} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 flex-wrap">
        <label htmlFor={`domaene-${org.id}`} className="sr-only">Nyt domæne</label>
        <input id={`domaene-${org.id}`} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(value)} placeholder="fx bjergiversen.dk" className={`${inputCls} flex-1 min-w-[160px] font-mono`} />
        <button type="button" onClick={() => add(value)} disabled={busy} className={btnSecondary}><Plus size={13} aria-hidden="true" /> Tilføj</button>
        {currentHost && !org.domains.includes(currentHost) && (
          <button type="button" onClick={() => add(currentHost)} disabled={busy} className={btnSecondary} title="Kobl den adresse, du bruger lige nu, til kæden">
            Brug {currentHost}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> {error}</p>}
    </div>
  );
}

function StoreRow({ store, orgs, org, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasOwn = !!(store.branding && Object.keys(store.branding).length);

  const setOrg = async (organizationId) => {
    setBusy(true); setError("");
    const r = await updateStoreBranding(store.id, { organizationId: organizationId || null });
    setBusy(false);
    if (!r.ok) { setError(r.fejl); return; }
    onChanged();
  };

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-ink flex-1 min-w-[120px]">
          {store.name}
          {hasOwn && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand/10 text-brand">Eget branding</span>}
        </p>
        {orgs ? (
          <>
            <label htmlFor={`kaede-${store.id}`} className="sr-only">Kæde for {store.name}</label>
            <select id={`kaede-${store.id}`} value="" onChange={(e) => e.target.value && setOrg(e.target.value)} disabled={busy || orgs.length === 0} className={`${inputCls} py-1.5`}>
              <option value="">{orgs.length ? "Vælg kæde..." : "Opret en kæde først"}</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={btnSecondary}>
              <Palette size={13} aria-hidden="true" /> {open ? "Luk" : "Butikkens branding"}
            </button>
            <button type="button" onClick={() => setOrg(null)} disabled={busy} className={btnSecondary} title="Fjern butikken fra kæden">Fjern fra kæde</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-danger mt-2 flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> {error}</p>}
      {open && org && (
        <div className="mt-3 pt-3 border-t border-divider">
          <BrandingForm
            title="Butikkens eget branding"
            hint={`Tomme felter arver fra ${org.name}. Sættes et logo her, bruges butikkens logoer i stedet for kædens.`}
            scope="store"
            ownerId={store.id}
            name={null}
            branding={store.branding || {}}
            inherited={resolveBranding(org, null)}
            onSave={(fields) => updateStoreBranding(store.id, { branding: fields.branding })}
            onSaved={onChanged}
          />
        </div>
      )}
    </div>
  );
}

function DeleteOrg({ org, storeCount, onChanged }) {
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    if (text.trim() !== org.name) { setError(`Skriv kædens navn ("${org.name}") for at bekræfte.`); return; }
    setBusy(true);
    const r = await deleteOrganization(org.id);
    if (!r.ok) { setBusy(false); setError(r.fejl); return; }
    await Promise.all([org.branding?.logo_light, org.branding?.logo_dark].filter(Boolean).map(deleteLogoFile));
    setBusy(false);
    onChanged();
  };

  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} className="text-xs text-muted hover:text-danger flex items-center gap-1.5 min-h-[44px]"><Trash2 size={13} aria-hidden="true" /> Slet kæde</button>;
  }
  return (
    <div className="rounded-lg border border-danger p-3">
      <p className="text-sm text-danger font-semibold mb-1">Slet "{org.name}"?</p>
      <p className="text-xs text-muted mb-2">
        Kædens branding og webadresser slettes. {storeCount > 0 ? `De ${storeCount} butikker bevares, men mister kæden og viser standardudseendet, medmindre de har eget branding.` : ""} Skriv kædens navn for at bekræfte.
      </p>
      <div className="flex gap-2 flex-wrap">
        <label htmlFor={`slet-${org.id}`} className="sr-only">Kædens navn</label>
        <input id={`slet-${org.id}`} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={org.name} className={`${inputCls} flex-1 min-w-[160px] border-danger`} />
        <button type="button" onClick={remove} disabled={busy} className="px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-white bg-danger hover:bg-ink transition-colors disabled:opacity-60 flex items-center gap-1.5">
          {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />} Slet
        </button>
        <button type="button" onClick={() => { setConfirming(false); setText(""); setError(""); }} className={btnSecondary}>Fortryd</button>
      </div>
      {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

// Fælles formular for kædens og butikkens branding. Nye logo-filer uploades
// først ved "Gem"; lykkes gemningen, ryddes de udskiftede filer op, og
// fejler den, fjernes de netop uploadede igen.
function BrandingForm({ title, hint, scope, ownerId, name, branding, inherited, onSave, onSaved }) {
  const [orgName, setOrgName] = useState(name || "");
  const [displayName, setDisplayName] = useState(branding.display_name || "");
  const [colors, setColors] = useState(() => ({ ...(branding.colors || {}) }));
  // pr. variant: { keep: sti|null } eller { file: File, preview: blob-url }
  const [logos, setLogos] = useState({ light: { keep: branding.logo_light || null }, dark: { keep: branding.logo_dark || null } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => () => {
    Object.values(logos).forEach((l) => l.preview && URL.revokeObjectURL(l.preview));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = inherited?.colors || DEFAULT_COLORS;
  const effectiveColors = useMemo(() => {
    const out = { ...base };
    for (const k of COLOR_KEYS) if (isHexColor(colors[k])) out[k] = colors[k];
    return out;
  }, [base, colors]);

  const logoSrc = (variant) => {
    const l = logos[variant];
    if (l.preview) return l.preview;
    if (l.keep) return logoUrl(l.keep);
    const ownHasLogo = logos.light.keep || logos.light.file || logos.dark.keep || logos.dark.file;
    if (!ownHasLogo && inherited) return logoUrl(variant === "light" ? inherited.logoLight : inherited.logoDark);
    return null;
  };

  const pickFile = (variant, file) => {
    setSaved(false); setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Logoet skal være PNG, JPG eller WebP."); return; }
    if (file.size > 1024 * 1024) { setError("Logoet må højst fylde 1 MB."); return; }
    setLogos((prev) => {
      if (prev[variant].preview) URL.revokeObjectURL(prev[variant].preview);
      return { ...prev, [variant]: { file, preview: URL.createObjectURL(file) } };
    });
  };
  const clearLogo = (variant) => {
    setSaved(false);
    setLogos((prev) => {
      if (prev[variant].preview) URL.revokeObjectURL(prev[variant].preview);
      return { ...prev, [variant]: { keep: null } };
    });
  };

  const save = async () => {
    setError(""); setSaved(false);
    if (name !== null && !orgName.trim()) { setError("Kæden skal have et navn."); return; }
    for (const k of COLOR_KEYS) if (colors[k] && !isHexColor(colors[k])) { setError(`${COLOR_LABEL[k]}: brug formatet #RRGGBB.`); return; }
    setBusy(true);

    const uploaded = [];
    const paths = {};
    for (const variant of ["light", "dark"]) {
      const l = logos[variant];
      if (l.file) {
        const r = await uploadLogo(scope, ownerId, variant, l.file);
        if (!r.ok) {
          await Promise.all(uploaded.map(deleteLogoFile));
          setBusy(false); setError(`Kunne ikke uploade logo: ${r.fejl}`); return;
        }
        uploaded.push(r.path);
        paths[variant] = r.path;
      } else {
        paths[variant] = l.keep;
      }
    }

    const next = {};
    if (displayName.trim()) next.display_name = displayName.trim();
    if (paths.light) next.logo_light = paths.light;
    if (paths.dark) next.logo_dark = paths.dark;
    const cleanColors = {};
    for (const k of COLOR_KEYS) if (isHexColor(colors[k])) cleanColors[k] = colors[k].toUpperCase();
    if (Object.keys(cleanColors).length) next.colors = cleanColors;

    const fields = { branding: next };
    if (name !== null) fields.name = orgName;
    const r = await onSave(fields);
    if (!r.ok) {
      await Promise.all(uploaded.map(deleteLogoFile));
      setBusy(false); setError(`Kunne ikke gemme: ${r.fejl}`); return;
    }
    const replaced = [branding.logo_light, branding.logo_dark].filter((p) => p && p !== paths.light && p !== paths.dark);
    await Promise.all(replaced.map(deleteLogoFile));
    setLogos({ light: { keep: paths.light || null }, dark: { keep: paths.dark || null } });
    setBusy(false); setSaved(true);
    onSaved?.();
  };

  const displayFallback = displayName.trim() || inherited?.displayName || orgName || "Navn";

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">{title}</h4>
      {hint && <p className="text-xs text-muted mb-3">{hint}</p>}

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        {name !== null && (
          <div>
            <label htmlFor={`navn-${ownerId}`} className="text-xs text-muted block mb-1">Kædens navn</label>
            <input id={`navn-${ownerId}`} value={orgName} onChange={(e) => { setOrgName(e.target.value); setSaved(false); }} maxLength={80} className={`${inputCls} w-full`} />
          </div>
        )}
        <div>
          <label htmlFor={`visning-${ownerId}`} className="text-xs text-muted block mb-1">Visningsnavn (vises hvis logo mangler)</label>
          <input id={`visning-${ownerId}`} value={displayName} onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }} maxLength={80} placeholder={inherited?.displayName || orgName} className={`${inputCls} w-full`} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <LogoField label="Logo til lys baggrund (login)" bg="light" src={logoSrc("light")} own={!!(logos.light.keep || logos.light.file)} inheritedNote={!!inherited} fallback={displayFallback} colors={effectiveColors} onPick={(f) => pickFile("light", f)} onClear={() => clearLogo("light")} id={`logo-light-${ownerId}`} />
        <LogoField label="Logo til mørk baggrund (topbar)" bg="dark" src={logoSrc("dark")} own={!!(logos.dark.keep || logos.dark.file)} inheritedNote={!!inherited} fallback={displayFallback} colors={effectiveColors} onPick={(f) => pickFile("dark", f)} onClear={() => clearLogo("dark")} id={`logo-dark-${ownerId}`} />
      </div>

      <fieldset className="mb-4">
        <legend className="text-xs text-muted mb-2">Farver {inherited ? "(tomme arver fra kæden)" : "(tomme bruger systemets standard)"}</legend>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {COLOR_KEYS.map((k) => (
            <ColorField key={k} id={`farve-${k}-${ownerId}`} label={COLOR_LABEL[k]} value={colors[k] || ""} placeholder={base[k]}
              onChange={(v) => { setColors((prev) => ({ ...prev, [k]: v })); setSaved(false); }} />
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-xs text-danger mb-2 flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> {error}</p>}
      {saved && <p role="status" className="text-xs text-success mb-2 flex items-center gap-1.5"><Check size={13} aria-hidden="true" /> Gemt.</p>}
      <button type="button" onClick={save} disabled={busy} className={btnPrimary}>
        {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {busy ? "Gemmer..." : "Gem branding"}
      </button>
    </div>
  );
}

function LogoField({ id, label, bg, src, own, inheritedNote, fallback, colors, onPick, onClear }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const style = bg === "dark" ? { background: colors.ink } : { background: "#FFFFFF" };
  return (
    <div>
      <p className="text-xs text-muted mb-1" id={`${id}-label`}>{label}</p>
      <div className="h-20 rounded-lg border border-line flex items-center justify-center px-3 overflow-hidden" style={style}>
        {src && !broken ? (
          <img src={src} alt="" className="max-h-14 max-w-full object-contain" onError={() => setBroken(true)} />
        ) : (
          <span className={`font-display text-lg uppercase tracking-tight truncate ${bg === "dark" ? "text-white" : "text-ink"}`}>{fallback}</span>
        )}
      </div>
      {!own && inheritedNote && src && <p className="text-[11px] text-muted mt-1">Arvet fra kæden</p>}
      <div className="flex gap-2 mt-2 flex-wrap">
        <label htmlFor={id} className={`${btnSecondary} cursor-pointer focus-within:ring-2 focus-within:ring-brand`}>
          <Upload size={13} aria-hidden="true" /> {own ? "Skift" : "Upload"}
          <input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-describedby={`${id}-label`}
            onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {own && <button type="button" onClick={onClear} className={btnSecondary}><X size={13} aria-hidden="true" /> Fjern</button>}
      </div>
    </div>
  );
}

function ColorField({ id, label, value, placeholder, onChange }) {
  const valid = isHexColor(value);
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} - farvevælger`} value={valid ? value : placeholder} onChange={(e) => onChange(e.target.value.toUpperCase())} className="w-11 h-11 shrink-0 rounded-lg border border-line bg-white p-1 cursor-pointer" />
        <input id={id} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} maxLength={7} className={`${inputCls} flex-1 min-w-0 font-mono ${value && !valid ? "border-danger" : ""}`} />
        {value && <button type="button" onClick={() => onChange("")} aria-label={`Nulstil ${label}`} className="p-2 text-muted hover:text-ink shrink-0"><X size={14} aria-hidden="true" /></button>}
      </div>
    </div>
  );
}

export { BrandingAdmin };
