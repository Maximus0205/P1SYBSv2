// Rene hjælpere til backup-visningen (ingen netværk).
export const BACKUP_ADVARSEL_TIMER = 30; // to backups i døgnet: er den nyeste ældre end dette, er noget galt

export function seneste(runs, status) {
  return (runs || []).find((r) => !status || r.status === status) || null;
}

// Returnerer null (alt vel) eller en tekst, der forklarer, hvorfor backup'en ikke er tryg.
export function backupAdvarsel(runs, nu = Date.now()) {
  const godkendt = seneste((runs || []).filter((r) => r.status === "ok" || r.status === "delvis"));
  if (!godkendt) return "Der findes endnu ingen gennemført backup.";
  const alderT = (nu - Date.parse(godkendt.faerdig_at || godkendt.startet_at)) / 3_600_000;
  if (alderT > BACKUP_ADVARSEL_TIMER) return `Seneste gennemførte backup er ${Math.floor(alderT)} timer gammel.`;
  const nyeste = runs[0];
  if (nyeste && nyeste.status === "fejl") return "Seneste backup fejlede.";
  return null;
}

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1).replace(".", ",")} kB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function varighed(run) {
  if (!run?.faerdig_at) return null;
  const s = Math.max(0, Math.round((Date.parse(run.faerdig_at) - Date.parse(run.startet_at)) / 1000));
  return s < 60 ? `${s} sek.` : `${Math.floor(s / 60)} min. ${s % 60} sek.`;
}

// Er backup'en hentet til den eksterne computer for nylig? (null = alt vel)
export function hentningAdvarsel(hentninger, nu = Date.now()) {
  const ok = (hentninger || []).find((h) => !h.fejl);
  if (!ok) return "Backup er endnu ikke hentet til en ekstern computer – så ligger den kun i Supabase.";
  const alderT = (nu - Date.parse(ok.hentet_at)) / 3_600_000;
  if (alderT > BACKUP_ADVARSEL_TIMER) return `Backup er sidst hentet til den eksterne computer for ${Math.floor(alderT)} timer siden.`;
  if (hentninger[0] && hentninger[0].fejl) return "Seneste hentning til den eksterne computer havde fejl.";
  return null;
}
