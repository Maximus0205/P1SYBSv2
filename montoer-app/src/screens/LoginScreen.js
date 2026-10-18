import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { hentBiometriLogin, loginMedKode, minKodeLaengde, slaaBiometriFra } from "../lib/auth";
import { farver, minTryk, radius } from "../theme";
import { Knap } from "../components/Knap";

// Log ind med butiksnummer, brugernavn (initialer) og kode. Er Face ID slået til på telefonen, spørges der med det samme.
// bio = { tilgaengelig, navn } fra biometriInfo, gemtBio = { butik, brugernavn } eller null.
export function LoginScreen({ bio, gemtBio, onLoggetInd, forhaandsFejl }) {
  const insets = useSafeAreaInsets();
  const [skiftet, setSkiftet] = useState(false);
  const gemt = skiftet ? null : gemtBio;
  const [butik, setButik] = useState(gemtBio?.butik || "");
  const [brugernavn, setBrugernavn] = useState(gemtBio?.brugernavn || "");
  const [pin, setPin] = useState("");
  const [visKode, setVisKode] = useState(false);
  const [optaget, setOptaget] = useState(false);
  const [fejl, setFejl] = useState(forhaandsFejl || "");
  const [nyKode, setNyKode] = useState(null); // { minLaengde, kraeverBlanding } når en midlertidig kode skal skiftes
  const [nyPin, setNyPin] = useState("");
  const [nyPin2, setNyPin2] = useState("");
  const [visFormular, setVisFormular] = useState(!(bio?.tilgaengelig && gemt));
  const brugernavnRef = useRef(null);
  const pinRef = useRef(null);
  const autoForsoegt = useRef(false);

  const bioKnapTekst = `Log ind med ${bio?.navn || "Face ID"}`;

  const medBiometri = async () => {
    setFejl("");
    setOptaget(true);
    const r = await hentBiometriLogin();
    if (r.status === "annulleret") { setOptaget(false); return; }
    if (r.status !== "ok") {
      setOptaget(false);
      await slaaBiometriFra();
      setFejl(`${bio?.navn || "Face ID"} er ikke længere sat op. Log ind med din kode.`);
      setVisFormular(true);
      return;
    }
    const svar = await loginMedKode(r.login);
    setOptaget(false);
    if (!svar.ok) {
      if (!svar.skalSkiftePin) await slaaBiometriFra(); // koden er ændret, så den gemte duer ikke mere
      setFejl(svar.fejl || "Koden er ændret. Log ind med din nye kode.");
      setVisFormular(true);
      return;
    }
    onLoggetInd({ butik: r.login.butik, brugernavn: r.login.brugernavn, pin: r.login.pin, fraBiometri: true });
  };

  // Spørg efter Face ID med det samme, når appen åbnes på en telefon der allerede er sat op.
  useEffect(() => {
    if (bio?.tilgaengelig && gemt && !autoForsoegt.current && !forhaandsFejl) {
      autoForsoegt.current = true;
      medBiometri();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logInd = async (nyKodeValg) => {
    setFejl("");
    if (!butik.trim() || !brugernavn.trim() || pin.length < 4) { setFejl("Udfyld butiksnummer, brugernavn og kode."); return; }
    setOptaget(true);
    const svar = await loginMedKode({ butik, brugernavn, pin, nyPin: nyKodeValg });
    setOptaget(false);
    if (svar.skalSkiftePin) { setNyKode({ minLaengde: svar.minLaengde, kraeverBlanding: svar.kraeverBlanding }); return; }
    if (!svar.ok) { setFejl(svar.fejl || "Forkert butik, bruger eller kode."); setPin(""); return; }
    onLoggetInd({ butik: butik.trim(), brugernavn: brugernavn.trim(), pin: nyKodeValg ? nyKodeValg : pin, fraBiometri: false });
  };

  const gemNyKode = () => {
    const min = minKodeLaengde(nyKode);
    if (nyPin.length < min) { setFejl(`Den nye kode er for kort. Mindst ${min} tegn${nyKode?.kraeverBlanding ? ", både bogstaver og tal" : ""}.`); return; }
    if (nyPin !== nyPin2) { setFejl("De to koder er ikke ens."); setNyPin2(""); return; }
    logInd(nyPin);
  };

  const felt = (props) => <TextInput placeholderTextColor={farver.svag} style={s.felt} autoCapitalize="none" autoCorrect={false} spellCheck={false} {...props} />;

  return (
    <KeyboardAvoidingView style={s.rod} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[s.indhold, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={s.logo}><Text style={s.logoTal}>1</Text></View>
        <Text style={s.appNavn}>P1SYBS Montør</Text>
        <Text style={s.velkommen}>{nyKode ? "Vælg din kode" : "Log ind"}</Text>

        <View style={s.kort}>
          {nyKode ? (
            <>
              <Text style={s.hjaelp}>Du loggede ind med en midlertidig kode. Vælg din egen kode, som du bruger fremover. Mindst {minKodeLaengde(nyKode)} tegn{nyKode.kraeverBlanding ? ", både bogstaver og tal" : ""}.</Text>
              <Text style={s.etiket}>Ny kode</Text>
              {felt({ value: nyPin, onChangeText: setNyPin, secureTextEntry: true, textContentType: "newPassword", returnKeyType: "next" })}
              <Text style={s.etiket}>Gentag koden</Text>
              {felt({ value: nyPin2, onChangeText: setNyPin2, secureTextEntry: true, textContentType: "newPassword", returnKeyType: "done", onSubmitEditing: gemNyKode })}
              {fejl ? <Text style={s.fejl} accessibilityRole="alert">{fejl}</Text> : null}
              <Knap titel="Gem kode og log ind" onPress={gemNyKode} optaget={optaget} stor style={{ marginTop: 16 }} />
              <Knap titel="Annuller" variant="tekst" onPress={() => { setNyKode(null); setPin(""); setNyPin(""); setNyPin2(""); setFejl(""); }} />
            </>
          ) : !visFormular ? (
            <>
              <Text style={s.hjaelp}>Velkommen tilbage{gemt?.brugernavn ? `, ${gemt.brugernavn.toUpperCase()}` : ""}.</Text>
              {fejl ? <Text style={s.fejl} accessibilityRole="alert">{fejl}</Text> : null}
              <Knap titel={bioKnapTekst} ikon="scan-outline" onPress={medBiometri} optaget={optaget} stor />
              <Knap titel="Brug kode i stedet" variant="tekst" onPress={() => setVisFormular(true)} />
              <Knap titel="Ikke dig? Skift bruger" variant="tekst" onPress={async () => { await slaaBiometriFra(); setSkiftet(true); setButik(""); setBrugernavn(""); setPin(""); setFejl(""); setVisFormular(true); }} />
            </>
          ) : (
            <>
              <Text style={s.etiket}>Butiksnummer</Text>
              {felt({ value: butik, onChangeText: setButik, keyboardType: "number-pad", returnKeyType: "next", onSubmitEditing: () => brugernavnRef.current?.focus() })}
              <Text style={s.etiket}>Brugernavn (initialer)</Text>
              <TextInput ref={brugernavnRef} value={brugernavn} onChangeText={setBrugernavn} placeholderTextColor={farver.svag} style={s.felt} autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="username" returnKeyType="next" onSubmitEditing={() => pinRef.current?.focus()} />
              <Text style={s.etiket}>Kode</Text>
              <View style={s.kodeRaekke}>
                <TextInput ref={pinRef} value={pin} onChangeText={(v) => setPin(v.replace(/\s/g, "").slice(0, 64))} placeholderTextColor={farver.svag} style={[s.felt, { flex: 1, marginBottom: 0 }]} autoCapitalize="none" autoCorrect={false} spellCheck={false} secureTextEntry={!visKode} textContentType="password" returnKeyType="go" onSubmitEditing={() => logInd()} />
                <Pressable onPress={() => setVisKode((v) => !v)} style={s.oje} accessibilityRole="button" accessibilityLabel={visKode ? "Skjul koden" : "Vis koden"}>
                  <Ionicons name={visKode ? "eye-off-outline" : "eye-outline"} size={22} color={farver.daempet} />
                </Pressable>
              </View>
              {fejl ? <Text style={s.fejl} accessibilityRole="alert">{fejl}</Text> : null}
              <Knap titel="Log ind" onPress={() => logInd()} optaget={optaget} stor style={{ marginTop: 16 }} />
              {bio?.tilgaengelig && gemt ? <Knap titel={bioKnapTekst} variant="sekundaer" ikon="scan-outline" onPress={medBiometri} style={{ marginTop: 10 }} /> : null}
              <Text style={s.fod}>Glemt din kode, eller er din bruger ny? Bed din butiks admin om en ny midlertidig kode.</Text>
            </>
          )}
        </View>
        {optaget && !nyKode ? <ActivityIndicator color={farver.hvid} style={{ marginTop: 16 }} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  rod: { flex: 1, backgroundColor: farver.ink },
  indhold: { paddingHorizontal: 20, alignItems: "center", flexGrow: 1 },
  logo: { width: 72, height: 72, borderRadius: 36, backgroundColor: farver.brand, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#E8E8E8" },
  logoTal: { color: farver.hvid, fontSize: 44, fontWeight: "900", marginTop: -2 },
  appNavn: { color: "#BBBBBB", fontSize: 13, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", marginTop: 14 },
  velkommen: { color: farver.hvid, fontSize: 30, fontWeight: "800", marginTop: 6, marginBottom: 22 },
  kort: { width: "100%", maxWidth: 460, backgroundColor: farver.hvid, borderRadius: radius.l + 4, padding: 20 },
  etiket: { fontSize: 13, color: farver.daempet, fontWeight: "600", marginBottom: 6 },
  felt: { minHeight: minTryk, borderWidth: 1.5, borderColor: farver.linje, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 17, color: farver.ink, backgroundColor: farver.panel, marginBottom: 14 },
  kodeRaekke: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  oje: { width: minTryk, height: minTryk, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  hjaelp: { fontSize: 15, color: farver.daempet, lineHeight: 21, marginBottom: 16 },
  fejl: { color: farver.fare, fontSize: 14, marginTop: 8, lineHeight: 19 },
  fod: { fontSize: 12, color: farver.svag, marginTop: 16, lineHeight: 17 },
});
