// Simulerede svar til testsiderne. Styres af adressens parametre, så hver test vælger sit scenarie:
//   ?pos=ok|fejl|tom   svaret fra POS ved forslag til erstatning
// Alt, der ikke står her, får en "ikke simuleret"-stub (se vite.e2e.config.js).
const q = new URLSearchParams(location.search);

// Opslag mod punkt1.dk: WAN... er en vaskemaskine, alt andet findes ikke.
export const lookupPunkt1Product = async (term) => {
  if (String(term).toUpperCase().startsWith("WAN")) {
    return { ok: true, matchCount: 1, brand: "Bosch", products: [{ title: "Bosch WAN28 Vaskemaskine 8 kg", productId: "111" }] };
  }
  return { ok: true, matchCount: 0, products: [] };
};

export const findPosAlternatives = async () => {
  const mode = q.get("pos") || "ok";
  if (mode === "fejl") return { ok: false, fejl: "POS-opslag er endnu ikke koblet til Flow Retail's API" };
  if (mode === "tom") return { ok: true, original: null, alternativer: [] };
  return {
    ok: true,
    original: { varenummer: "1", maerke: "Point", model: "POWM58MKA", udsalgspris: 5000, indkoebspris: 3000, lager: 0 },
    alternativer: [
      { varenummer: "3", navn: "Vaskemaskine 9 kg", maerke: "Bosch", model: "WAN28", udsalgspris: 9000, indkoebspris: 6000, lager: 1 },
      { varenummer: "2", navn: "Vaskemaskine 8 kg", maerke: "AEG", model: "LR744PX6P", udsalgspris: 6250, indkoebspris: 3500, lager: 2, forskelle: ["Større tromle"] },
      { varenummer: "4", navn: "Vaskemaskine", maerke: "Beko", model: "B1", udsalgspris: 5100, indkoebspris: null, lager: 0 },
    ],
  };
};
