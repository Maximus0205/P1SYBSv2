// Funktioner, systemadmin kan slå til/fra pr. butik (oktober 2026).
// Nøglerne SKAL matche store_feature_keys() i databasen
// (supabase/migrations/20261011160000_store_features.sql og 20261019100000_tid_funktioner.sql).
// Det meste er TIL som standard; funktioner med standard:false er FRA, til systemadmin
// eksplicit slår dem til (oktober 2026: tidsforslag).
export const STORE_FEATURES = [
  { gruppe: "Sagskort", noegle: "sag_rapporter", navn: "Rapporter", beskrivelse: "Fanen Rapporter, hvor montøren skriver fx en afleveringsrapport." },
  { gruppe: "Sagskort", noegle: "sag_billeder", navn: "Billeder", beskrivelse: "Fanen Billeder, hvor der tages og vises billeder på sagen." },
  { gruppe: "Sagskort", noegle: "sag_materialer", navn: "Materialer", beskrivelse: "Fanen Materialer til registrering af materialeforbrug." },
  { gruppe: "Booking", noegle: "book_kvittering", navn: "Indlæs kvittering (PDF)", beskrivelse: "Udfylder booking ud fra en uploadet kvittering." },
  { gruppe: "Booking", noegle: "book_koeber", navn: "Køber / fakturering", beskrivelse: "Felterne til en anden køber end modtageren." },
  { gruppe: "Booking", noegle: "book_kapacitetstjek", navn: "Kapacitetstjek", beskrivelse: "Tjekker bilens kapacitet og kan blokere en booking." },
  { gruppe: "Tid", noegle: "tid_stempling", navn: "Tidsstempling på sager", beskrivelse: "Start opgave / Færdigmeld gemmer start- og sluttid, og montøren ser en tæller under opgaven. Slået fra: ingen tider registreres. Registrerede tider kan kun ses af systemadmin (Systemadmin → Tidsmålinger)." },
  { gruppe: "Tid", noegle: "tid_forslag", standard: false, navn: "Tidsforslag i booking", beskrivelse: "Foreslår en tid ud fra målte, tidligere sager af samme vare og ydelse. Kan først slås til, når der er målt nok." },
];

// Er funktionen TIL, når butikken ikke har sat noget? (Alt andet end standard:false er til.)
export const featureStandard = (noegle) => STORE_FEATURES.find((f) => f.noegle === noegle)?.standard !== false;

export const FEATURE_KEYS = STORE_FEATURES.map((f) => f.noegle);
