// Vedhæftninger: billeder, underskrifter og anden dokumentation på en sag. Selve logikken (to-fase-upload, signerede
// URL'er, lagerforbrug, opsætning af butikkens eget lager) ligger siden oktober 2026 i adapteren src/adapters/lager
// (uafhængig af appen og genbrugelig i andre projekter). Denne fil er de gamle navne, plus det, der er appens sag:
// at melde en mislykket upload eller sletning til brugeren (se lib/saveStatus.js) - en upload, der fejler i
// stilhed, er præcis den fejltype, montøren opdager for sent.
import { lager } from "../adapters";
import { reportSaveFailure } from "./saveStatus";

export { formatBytes } from "../adapters/lager";

export const getAttachments = (orderId, storeId) => lager.hentVedhaeftninger(orderId, storeId);
export const getAttachmentUrl = (attachmentId) => lager.hentUrl(attachmentId);
export const getAttachmentUrls = (attachmentIds) => lager.hentUrls(attachmentIds);
export const getStorageUsage = (storeId) => lager.hentForbrug(storeId);

export async function uploadAttachment(args) {
  const r = await lager.upload(args);
  if (!r.ok && args?.orderId && args?.file) reportSaveFailure(`Dokumentationen blev ikke gemt: ${r.fejl}`);
  return r;
}

export async function markAttachmentForDeletion(attachmentId) {
  const r = await lager.markerTilSletning(attachmentId);
  if (!r.ok) reportSaveFailure(`Kunne ikke fjerne dokumentationen: ${r.fejl}`);
  return r;
}
