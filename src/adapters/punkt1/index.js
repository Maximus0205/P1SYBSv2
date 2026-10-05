// PUNKT1-ADAPTER (produktopslag) - oktober 2026.
//
// Slår et modelnummer op i punkt1.dk's offentlige søge-API gennem Edge Functionen punkt1-produktopslag
// (undgår CORS ved at kalde det direkte fra browseren). UAFHÆNGIG AF APPEN: ingen imports. Se README.md.
export function opretPunkt1Adapter({ transport } = {}) {
  if (!transport || typeof transport.kald !== "function") throw new Error("opretPunkt1Adapter: transport mangler");

  return {
    async produktopslag(model) {
      const r = await transport.kald("punkt1-produktopslag", { model }, { standardFejl: "Kunne ikke slå produktet op på punkt1.dk", kilde: "punkt1:produktopslag" });
      if (!r.ok) return { ok: false, fejl: r.fejl };
      return { ok: true, matchCount: r.data?.matchCount, brand: r.data?.brand, products: r.data?.products };
    },
  };
}
