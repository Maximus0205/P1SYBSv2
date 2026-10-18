import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ER_SAT_OP } from "./src/lib/config";
import { supabase } from "./src/lib/supabase";
import { biometriInfo, hentButik, hentProfil, laesBioFlag, logUd, maaBrugeAppen, slaaBiometriTil } from "./src/lib/auth";
import { LoginScreen } from "./src/screens/LoginScreen";
import { LaasScreen } from "./src/screens/LaasScreen";
import { RuteScreen } from "./src/screens/RuteScreen";
import { KontoSheet } from "./src/screens/KontoSheet";
import { farver } from "./src/theme";

const PROFIL_CACHE = "p1sybs_montor_profil";
const LAAS_EFTER_MS = 2 * 60 * 1000; // låses igen, når appen har været i baggrunden i mere end to minutter

async function gemProfilCache(profil, butik) {
  try { await AsyncStorage.setItem(PROFIL_CACHE, JSON.stringify({ profil, butik })); } catch { /* kun en bonus */ }
}
async function laesProfilCache(userId) {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(PROFIL_CACHE)) || "null");
    return v?.profil?.id === userId ? v : null;
  } catch { return null; }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Rod />
    </SafeAreaProvider>
  );
}

function Rod() {
  const [fase, setFase] = useState("starter"); // starter | login | laast | inde
  const [profil, setProfil] = useState(null);
  const [butik, setButik] = useState(null);
  const [bio, setBio] = useState({ tilgaengelig: false, navn: "Face ID" });
  const [gemtBio, setGemtBio] = useState(null);
  const [loginFejl, setLoginFejl] = useState("");
  const [kontoSynlig, setKontoSynlig] = useState(false);
  const baggrundSiden = useRef(null);
  const faseRef = useRef(fase);
  faseRef.current = fase;
  const gemtBioRef = useRef(gemtBio);
  gemtBioRef.current = gemtBio;
  const bioRef = useRef(bio);
  bioRef.current = bio;

  // Henter profil og butik. Uden net bruges den sidst gemte, så en montør kan komme ind uden forbindelse.
  const indlaesBruger = useCallback(async (userId) => {
    try {
      const p = await hentProfil(userId);
      if (!p) return { status: "ukendt" };
      const b = await hentButik(p.butikId);
      await gemProfilCache(p, b);
      return { status: "ok", profil: p, butik: b };
    } catch {
      const c = await laesProfilCache(userId);
      return c ? { status: "ok", profil: c.profil, butik: c.butik } : { status: "offline" };
    }
  }, []);

  const afvis = useCallback(async (tekst) => {
    await logUd();
    setProfil(null); setButik(null);
    setLoginFejl(tekst);
    setFase("login");
  }, []);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const [{ data }, info, flag] = await Promise.all([supabase.auth.getSession(), biometriInfo(), laesBioFlag()]);
      if (!aktiv) return;
      setBio(info);
      setGemtBio(flag);
      const session = data?.session;
      if (!session) { setFase("login"); return; }
      const r = await indlaesBruger(session.user.id);
      if (!aktiv) return;
      if (r.status === "ukendt") { await afvis("Brugeren blev ikke fundet. Log ind igen."); return; }
      if (r.status === "offline") { setFase("login"); setLoginFejl("Ingen forbindelse. Tjek nettet og prøv igen."); return; }
      if (!maaBrugeAppen(r.profil)) { await afvis("Appen er til montører og medhjælpere. Brug webappen i stedet."); return; }
      setProfil(r.profil); setButik(r.butik);
      setFase(flag && info.tilgaengelig ? "laast" : "inde");
    })();
    return () => { aktiv = false; };
  }, [indlaesBruger, afvis]);

  // Lås igen, når appen har været væk et stykke tid. Kun "background" tæller: "inactive" opstår også, mens Face ID-boksen vises.
  useEffect(() => {
    const abo = AppState.addEventListener("change", (tilstand) => {
      if (tilstand === "background") baggrundSiden.current = Date.now();
      else if (tilstand === "active") {
        const vaek = baggrundSiden.current ? Date.now() - baggrundSiden.current : 0;
        baggrundSiden.current = null;
        if (vaek > LAAS_EFTER_MS && faseRef.current === "inde" && gemtBioRef.current && bioRef.current.tilgaengelig) setFase("laast");
      }
    });
    return () => abo.remove();
  }, []);

  const efterLogin = async ({ butik: butikNr, brugernavn, pin, fraBiometri }) => {
    const { data } = await supabase.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) { await afvis("Login lykkedes ikke. Prøv igen."); return; }
    const r = await indlaesBruger(userId);
    if (r.status !== "ok") { await afvis(r.status === "offline" ? "Ingen forbindelse. Tjek nettet og prøv igen." : "Brugeren blev ikke fundet."); return; }
    if (!maaBrugeAppen(r.profil)) { await afvis("Appen er til montører og medhjælpere. Brug webappen i stedet."); return; }
    setLoginFejl("");
    setProfil(r.profil); setButik(r.butik);
    setFase("inde");
    // Første gang på en telefon med Face ID: tilbyd at slå det til.
    if (!fraBiometri && bio.tilgaengelig && !gemtBio) {
      Alert.alert(`Log ind med ${bio.navn}?`, `Næste gang kan du åbne appen med ${bio.navn} i stedet for at skrive din kode.`, [
        { text: "Ikke nu", style: "cancel" },
        { text: "Ja, slå til", onPress: async () => { if (await slaaBiometriTil({ butik: butikNr, brugernavn, pin })) setGemtBio({ butik: butikNr, brugernavn }); } },
      ]);
    }
  };

  const loggerUd = async () => {
    await logUd();
    setProfil(null); setButik(null); setKontoSynlig(false);
    setLoginFejl("");
    setFase("login");
  };

  if (!ER_SAT_OP) {
    return (
      <View style={s.midt}>
        <Text style={s.titel}>Appen er ikke sat op</Text>
        <Text style={s.tekst}>Adressen til databasen mangler i denne version af appen. Kontakt den, der har bygget den.</Text>
      </View>
    );
  }
  if (fase === "starter") {
    return (
      <View style={s.midt}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={farver.hvid} />
      </View>
    );
  }
  if (fase === "login") {
    return <LoginScreen key={loginFejl || "login"} bio={bio} gemtBio={gemtBio} forhaandsFejl={loginFejl} onLoggetInd={efterLogin} />;
  }
  if (fase === "laast") {
    return <LaasScreen bioNavn={bio.navn} onLaasOp={() => setFase("inde")} onLogUd={loggerUd} />;
  }
  return (
    <>
      <RuteScreen profil={profil} butik={butik} onKonto={() => setKontoSynlig(true)} />
      <KontoSheet
        synlig={kontoSynlig} onLuk={() => setKontoSynlig(false)} profil={profil} butik={butik}
        bio={bio} bioAktiv={!!gemtBio}
        onBioAendret={(til) => setGemtBio(til ? { butik: butik?.nummer ? String(butik.nummer) : "", brugernavn: profil?.brugernavn || "" } : null)}
        onLogUd={loggerUd}
      />
    </>
  );
}

const s = StyleSheet.create({
  midt: { flex: 1, backgroundColor: farver.ink, alignItems: "center", justifyContent: "center", padding: 28 },
  titel: { color: farver.hvid, fontSize: 22, fontWeight: "800", textAlign: "center" },
  tekst: { color: "#BBBBBB", fontSize: 15, marginTop: 10, textAlign: "center", lineHeight: 21 },
});
