// SMS-ADAPTER (GatewayAPI) - oktober 2026.
//
// Sender SMS'er gennem Edge Functionen send-ankomst-sms (token og afsender ligger som secrets i Supabase,
// aldrig i browseren). UAFHÆNGIG AF APPEN: ingen imports; transport og log gives udefra. Se README.md.
export function opretSmsAdapter({ transport } = {}) {
  if (!transport || typeof transport.kald !== "function") throw new Error("opretSmsAdapter: transport mangler");

  return {
    // Ankomst-SMS til kunden, fra butikkens FÆLLES afsender (ikke montørens egen telefon).
    //   minutter     hvor lang tid der går - eller, med minutterTil, det MINDSTE
    //   minutterTil  valgfri: sendes et interval "mellem <minutter> og <minutterTil>"
    async sendAnkomstSms({ telefon, minutter, minutterTil, kundeNavn }) {
      const body = { telefon, minutter, kundeNavn };
      if (minutterTil !== undefined && minutterTil !== null) body.minutterTil = minutterTil;
      const r = await transport.kald("send-ankomst-sms", body, { standardFejl: "Kunne ikke sende SMS'en", kilde: "sms:sendAnkomstSms" });
      return r.ok ? { ok: true } : { ok: false, fejl: r.fejl };
    },
  };
}
