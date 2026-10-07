import React, { useEffect, useState } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { hentKapacitetsIndstillinger, gemKapacitetsIndstillinger } from "../lib/kapacitetStore";
import { geocodeAddress } from "../lib/geocoding";
import { rensIndstillinger } from "../engine/kapacitet";
import { REGLER, NIVEAUER } from "../engine/kapacitet/indstillinger";

// Admin -> Kapacitet (oktober 2026): de indstillinger, den digitale disponent (kapacitetsmotoren) planlægger efter. Alt har en fornuftig
// standard, så intet SKAL rettes. Personers vægt (86,5 kg) er en fast faktor og kan ikke sættes her.
const NIVEAU_TEKST = { fra: "Fra", raadgivende: "Rådgivende (advarsel)", krav: "Krav (blokerer)" };
const DAGE = [[1, "Man"], [2, "Tir"], [3, "Ons"], [4, "Tor"], [5, "Fre"], [6, "Lør"], [7, "Søn"]];

function Felt({ id, label, hjaelp, enhed, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">{label}</label>
      <div className="flex items-center gap-2">{children}{enhed && <span className="text-sm text-muted">{enhed}</span>}</div>
      {hjaelp && <p className="text-[11px] text-muted mt-1">{hjaelp}</p>}
    </div>
  );
}
const talFelt = "w-24 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:border-brand";
const kort = "rounded-xl border border-line bg-white p-5 shadow-sm mb-4 max-w-2xl";
const overskrift = "text-sm font-semibold uppercase tracking-wide text-ink mb-3";

function KapacitetsIndstillinger({ storeId, butikAdresse }) {
  const [ind, setInd] = useState(null);
  const [gemt, setGemt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [besked, setBesked] = useState("");
  const [kunneIkkeHentes, setKunneIkkeHentes] = useState(false);

  useEffect(() => {
    let levende = true;
    setInd(null); setKunneIkkeHentes(false);
    hentKapacitetsIndstillinger(storeId).then((r) => {
      if (!levende) return;
      if (!r) { setKunneIkkeHentes(true); return; }
      setInd(r); setGemt(JSON.stringify(r));
    });
    return () => { levende = false; };
  }, [storeId]);

  const sæt = (gruppe, felt, vaerdi) => { setInd((p) => ({ ...p, [gruppe]: { ...p[gruppe], [felt]: vaerdi } })); setBesked(""); };
  const tal = (gruppe, felt, id) => (
    <input id={id} type="number" inputMode="decimal" value={ind[gruppe][felt]} onChange={(e) => sæt(gruppe, felt, e.target.value)} className={talFelt} />
  );
  const aendret = !!ind && JSON.stringify(rensIndstillinger(ind)) !== gemt;

  const gem = async () => {
    setFejl(""); setBesked("");
    let ny = rensIndstillinger(ind);
    setBusy(true);
    // Lagerets koordinater slås op, når adressen er ændret. Er adressen tom, bruges butikkens.
    const adresse = ny.lager.adresse.trim();
    const foer = JSON.parse(gemt).lager;
    if (adresse && adresse !== foer.adresse) {
      const k = await geocodeAddress(adresse);
      if (!k) { setBusy(false); setFejl("Lagerets adresse kunne ikke findes. Tjek stavningen, eller lad feltet stå tomt for at bruge butikkens adresse."); return; }
      ny = { ...ny, lager: { adresse, lat: k.lat, lon: k.lon } };
    } else if (!adresse) {
      ny = { ...ny, lager: { adresse: "", lat: null, lon: null } };
    }
    const r = await gemKapacitetsIndstillinger(storeId, ny);
    setBusy(false);
    if (!r.ok) { setFejl(r.fejl || "Indstillingerne blev ikke gemt."); return; }
    setInd(ny); setGemt(JSON.stringify(ny)); setBesked("Gemt.");
  };

  if (kunneIkkeHentes) return <p className="text-xs text-danger flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" /> Indstillingerne kunne ikke hentes. Tjek forbindelsen og prøv igen.</p>;
  if (!ind) return <p className="text-xs text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Henter...</p>;

  return (
    <div>
      <div className={kort}>
        <h3 className={overskrift}>Lager</h3>
        <Felt id="kap-lager" label="Lagerets adresse" hjaelp={`Her møder montøren ind, læsser, omlaster og tømmer bilen. Tom = butikkens adresse${butikAdresse ? ` (${butikAdresse})` : ""}.`}>
          <input id="kap-lager" value={ind.lager.adresse} onChange={(e) => sæt("lager", "adresse", e.target.value)} placeholder="Tom = butikkens adresse" className="flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
        </Felt>
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Tider</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Felt id="kap-morgen" label="Læsning om morgenen" enhed="min">{tal("tider", "morgenLaesningMin", "kap-morgen")}</Felt>
          <Felt id="kap-omlast" label="Omlastning" hjaelp="Lægges automatisk ind som et lager-stop, når bilen ikke kan have det hele på én gang (skrot afleveres, nyt læsses)." enhed="min">{tal("tider", "omlastningMin", "kap-omlast")}</Felt>
          <Felt id="kap-afslut" label="Tømning ved dagens slutning" enhed="min">{tal("tider", "dagsafslutningMin", "kap-afslut")}</Felt>
          <Felt id="kap-buffer" label="Buffer pr. stop" hjaelp="Parkering, gå ind, afslutte hos kunden." enhed="min">{tal("tider", "stopBufferMin", "kap-buffer")}</Felt>
          <Felt id="kap-pause" label="Pause lægges tidligst" hjaelp="Så mange minutter efter dagens start (210 = 3,5 time)." enhed="min">{tal("tider", "pauseEfterMin", "kap-pause")}</Felt>
          <Felt id="kap-overtid" label="Tilladt overtid" hjaelp="Hvor langt over sluttid en dag må strække sig." enhed="min">{tal("tider", "tilladtOvertidMin", "kap-overtid")}</Felt>
        </div>
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Standard arbejdsdag</h3>
        <p className="text-xs text-muted mb-3">Gælder for alle montører, der ikke har egen arbejdstid (sættes pr. montør under Montører).</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Felt id="kap-start" label="Start"><input id="kap-start" type="time" value={ind.tider.standardStart} onChange={(e) => sæt("tider", "standardStart", e.target.value)} className={talFelt} /></Felt>
          <Felt id="kap-slut" label="Slut"><input id="kap-slut" type="time" value={ind.tider.standardSlut} onChange={(e) => sæt("tider", "standardSlut", e.target.value)} className={talFelt} /></Felt>
          <Felt id="kap-stdpause" label="Pause" enhed="min">{tal("tider", "standardPauseMin", "kap-stdpause")}</Felt>
        </div>
        <fieldset className="mt-4">
          <legend className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Arbejdsdage</legend>
          <div className="flex flex-wrap gap-2">
            {DAGE.map(([n, navn]) => {
              const aktiv = ind.tider.arbejdsdage.includes(n);
              return (
                <label key={n} className={`min-h-[44px] px-3 flex items-center gap-2 rounded-lg border text-sm cursor-pointer ${aktiv ? "border-brand text-ink" : "border-line text-muted"}`}>
                  <input type="checkbox" checked={aktiv} onChange={() => sæt("tider", "arbejdsdage", aktiv ? ind.tider.arbejdsdage.filter((d) => d !== n) : [...ind.tider.arbejdsdage, n].sort())} className="accent-brand" /> {navn}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Kørsel og økonomi</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Felt id="kap-trafik" label="Trafiktillæg" hjaelp="Ruteberegningen kender ikke trafikken." enhed="%">{tal("koersel", "trafikTillaegPct", "kap-trafik")}</Felt>
          <Felt id="kap-timepris" label="Timepris pr. person" hjaelp="Bruges kun til at vælge den billigste rute." enhed="kr">{tal("oekonomi", "timeprisKr", "kap-timepris")}</Felt>
          <Felt id="kap-kmpris" label="Pris pr. km" enhed="kr">{tal("oekonomi", "kmprisKr", "kap-kmpris")}</Felt>
        </div>
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Nyttelast og plads</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Felt id="kap-vmargin" label="Sikkerhedsmargin på nyttelast" hjaelp="Trækkes fra den tilladte vægt. Bilens nyttelast og værktøj sættes under Biler." enhed="%">{tal("nyttelast", "sikkerhedsmarginPct", "kap-vmargin")}</Felt>
          <Felt id="kap-emb" label="Emballagemargin" hjaelp="Lægges til hver side af varens mål (karton og skum)." enhed="cm">{tal("pakning", "emballageMarginCm", "kap-emb")}</Felt>
        </div>
        <p className="text-[11px] text-muted mt-3">Personer i bilen regnes automatisk med en fast standardvægt; den kan ikke ændres.</p>
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Samling af kørsel</h3>
        <Felt id="kap-samling" label="Højst ekstra ventetid for at samle kørsel" hjaelp="Bruges af forslag ved booking (kommer): en kunde skal ikke vente længere end dette for at spare kørsel." enhed="dage">{tal("samling", "maksEkstraVentetidDage", "kap-samling")}</Felt>
      </div>

      <div className={kort}>
        <h3 className={overskrift}>Hvilke regler styrer planlægningen?</h3>
        <p className="text-xs text-muted mb-3"><strong>Krav</strong> blokerer en booking, der bryder reglen. <strong>Rådgivende</strong> advarer, men blokerer ikke. <strong>Fra</strong> ignorerer reglen.</p>
        <div className="space-y-3">
          {Object.entries(REGLER).map(([noegle, tekst]) => (
            <div key={noegle} className="flex items-center justify-between gap-3 flex-wrap">
              <label htmlFor={`regel-${noegle}`} className="text-sm text-ink flex-1 min-w-[200px]">{tekst}</label>
              <select id={`regel-${noegle}`} value={ind.regler[noegle]} onChange={(e) => sæt("regler", noegle, e.target.value)} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink min-h-[44px] focus:outline-none focus:border-brand">
                {NIVEAUER.map((n) => <option key={n} value={n}>{NIVEAU_TEKST[n]}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {fejl && <p role="alert" className="text-xs text-danger mb-3 flex items-center gap-1.5"><AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {fejl}</p>}
      {besked && <p role="status" className="text-xs text-success mb-3 flex items-center gap-1.5"><Check size={13} className="shrink-0" aria-hidden="true" /> {besked}</p>}
      <button onClick={gem} disabled={!aendret || busy} className="min-h-[44px] px-5 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand focus:outline-none focus:ring-2 focus:ring-brand transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none">
        {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {busy ? "Gemmer..." : "Gem indstillinger"}
      </button>
    </div>
  );
}

export { KapacitetsIndstillinger };
