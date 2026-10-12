// Regler for en varelinjes MODELNUMMER (oktober 2026). Ren logik uden afhængigheder
// (tests/varelinje.test.mjs).
//
// MODELNUMMERET ER VARENUMMERET i butikken (fx PODW5620W). Punkt1-id'et (punkt1Id)
// mangler ofte og er kun en ekstra oplysning - vi får af og til varer udefra, der ikke
// er en fast del af Punkt1-sortimentet, og dem skal der stadig kunne holdes styr på.
//
// TO FORSKELLIGE SPØRGSMÅL:
//   1. Er der angivet et modelnummer? (manglerModel) - kravet ved booking: en sag kan
//      ikke bookes, hvis en varelinje står uden.
//   2. Ligner det et rigtigt modelnummer? (erVarenummer) - afgør, om linjen tælles med i
//      disponentens samlede optælling. Modelfeltet bruges nemlig også til fritekst
//      (fx "Mål op til vinkøleskab og emhætte, husk at tjekke tilslutning"), og fritekst
//      skal ikke stå som en vare i en optælling til lager og bestilling.
//
// "Ligner et modelnummer" er en forsigtig tommelfingerregel, ikke en sandhed: et
// modelnummer indeholder (så godt som) altid mindst ét ciffer og er kort - uden komma,
// højst tre ord og højst 40 tegn. "Diverse" eller en hel sætning tæller derfor ikke.

const tekst = (v) => (v ?? "").toString().trim();

const modelkode = (linje) => tekst(linje?.model);

const manglerModel = (linje) => modelkode(linje) === "";

const linjerUdenModel = (linjer) => (Array.isArray(linjer) ? linjer : []).filter(manglerModel);

const MAKS_TEGN = 40;
const MAKS_ORD = 3;

function erVarenummer(linje) {
  const m = modelkode(linje);
  if (m === "") return false;
  if (!/\d/.test(m)) return false;
  if (m.includes(",")) return false;
  if (m.length > MAKS_TEGN) return false;
  if (m.split(/\s+/).length > MAKS_ORD) return false;
  return true;
}

// Samme model skrevet på flere måder (store/små bogstaver, ekstra mellemrum) er ÉN vare.
const modelNoegle = (linje) => modelkode(linje).toLowerCase().replace(/\s+/g, " ");

export { modelkode, manglerModel, linjerUdenModel, erVarenummer, modelNoegle };
