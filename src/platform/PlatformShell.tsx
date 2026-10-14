import React from "react";
import { CalendarClock, ExternalLink, Home, LogOut, PackageSearch, RotateCcw, Settings, Store, type LucideIcon } from "lucide-react";

import { PUNKT1_LOGO_NEGATIV } from "../assets/logo";
import { PLATFORM_APPS, synligeApps, type AppIkon, type PlatformApp } from "./appRegister";

// ---------------------------------------------------------------------------
// PLATFORM-SKAL (oktober 2026): mørk topbar og sidebar + forside med
// app-fliser, bygget ud fra appRegister.ts. Vises kun bag PLATFORM_ENABLED
// (se flag.ts) på ruten #/platform.
//
// Skallen har bevidst INGEN egen login eller datahentning: den får den
// indloggede profil og de tilladte sider fra App.jsx, som allerede har
// løst session, butik og rettigheder. Se afsnit 5 i CLAUDE.md.
// ---------------------------------------------------------------------------

const IKONER: Record<AppIkon, LucideIcon> = {
  servicebooking: CalendarClock,
  sbo: PackageSearch,
  rma: RotateCcw,
  butik: Store,
  system: Settings,
};

type PlatformProfil = {
  navn: string;
  erSystemadmin: boolean;
};

type Props = {
  profile: PlatformProfil;
  storeNavn?: string;
  tilladteSider: readonly string[];
  onNavigate: (rute: string) => void;
  onLogOut: () => void;
};

const fokus = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function AppFlise({ app, onNavigate }: { app: PlatformApp; onNavigate: (rute: string) => void }) {
  const Ikon = IKONER[app.ikon];
  const indhold = (
    <>
      <Ikon size={36} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
      <span className="mt-3 text-base font-semibold text-ink">{app.navn}</span>
      <span className="mt-1 text-sm text-muted">{app.beskrivelse}</span>
    </>
  );
  const kort = "flex flex-col items-center text-center rounded-xl border border-line bg-white p-6 min-h-[11rem] shadow-sm";

  if (app.type === "link") {
    return (
      <a href={app.url} target="_blank" rel="noopener noreferrer" className={`${kort} hover:border-brand transition-colors ${fokus}`}>
        {indhold}
        <span className="mt-3 inline-flex items-center gap-1 text-xs text-muted">
          <ExternalLink size={12} aria-hidden="true" /> Åbner i ny fane
        </span>
      </a>
    );
  }

  if (app.status === "planlagt") {
    return (
      <div aria-disabled="true" className={`${kort} opacity-60`}>
        {indhold}
        <span className="mt-3 rounded-full bg-panel border border-line px-2.5 py-0.5 text-xs text-muted">Kommer snart</span>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => onNavigate(app.rute)} className={`${kort} hover:border-brand transition-colors ${fokus}`}>
      {indhold}
    </button>
  );
}

export function PlatformShell({ profile, storeNavn, tilladteSider, onNavigate, onLogOut }: Props) {
  const apps = synligeApps(PLATFORM_APPS, { erSystemadmin: profile.erSystemadmin, tilladteSider });
  const aktiveInterne = apps.filter((a): a is Extract<PlatformApp, { rute: string }> => a.type === "intern" && a.status === "aktiv");
  const fornavn = profile.navn.trim().split(/\s+/)[0] || profile.navn;

  return (
    <div className="min-h-screen w-full flex flex-col bg-paper" style={{ fontFamily: "Inter, sans-serif" }}>
      <header className="sticky top-0 z-20 bg-ink">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <img src={PUNKT1_LOGO_NEGATIV} alt="Punkt1" className="h-7 w-auto shrink-0" />
          {storeNavn && <span className="min-w-0 truncate text-xs text-[#C9C9C9]">{storeNavn}</span>}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline text-xs text-[#C9C9C9] pr-1">{profile.navn}</span>
            <button
              type="button"
              onClick={onLogOut}
              aria-label="Log ud"
              title="Log ud"
              className="w-10 h-10 rounded-lg bg-black border border-[#333] flex items-center justify-center text-brand hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar kun fra md og op. På mobil er fliserne selv navigationen,
            så skærmen ikke deles mellem to menuer. */}
        <nav aria-label="Platformmenu" className="hidden md:flex w-56 shrink-0 flex-col gap-1 bg-ink px-3 py-4">
          <span aria-current="page" className="flex items-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-white">
            <Home size={16} aria-hidden="true" /> Forside
          </span>
          {aktiveInterne.map((app) => {
            const Ikon = IKONER[app.ikon];
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onNavigate(app.rute)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#C9C9C9] hover:text-white transition-colors ${fokus}`}
              >
                <Ikon size={16} aria-hidden="true" /> <span className="truncate">{app.navn}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 min-w-0 px-4 py-6 md:px-8">
          <h1 className="text-xl font-semibold text-ink">Velkommen tilbage, {fornavn}</h1>
          <p className="mt-1 text-sm text-muted">Her er dine applikationer og værktøjer.</p>

          {apps.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Du har endnu ikke adgang til nogen apps. Kontakt din administrator.</p>
          ) : (
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {apps.map((app) => (
                <li key={app.id} className="flex flex-col [&>*]:flex-1">
                  <AppFlise app={app} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
