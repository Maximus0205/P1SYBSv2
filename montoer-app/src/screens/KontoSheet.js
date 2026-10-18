import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { loginMedKode, slaaBiometriFra, slaaBiometriTil } from "../lib/auth";
import { farver, minTryk, radius } from "../theme";
import { Knap } from "../components/Knap";

const ROLLER = { montor: "Montør", medhjaelper: "Medhjælper", lager: "Lager", saelger: "Sælger", admin: "Administrator" };

// Min konto: hvem er logget ind, Face ID til/fra og log ud.
export function KontoSheet({ synlig, onLuk, profil, butik, bio, bioAktiv, onBioAendret, onLogUd }) {
  const insets = useSafeAreaInsets();
  const [spoerger, setSpoerger] = useState(false);
  const [kode, setKode] = useState("");
  const [optaget, setOptaget] = useState(false);
  const [fejl, setFejl] = useState("");

  const luk = () => { setSpoerger(false); setKode(""); setFejl(""); onLuk(); };

  const skift = async (til) => {
    setFejl("");
    if (til) { setSpoerger(true); return; }
    await slaaBiometriFra();
    onBioAendret(false);
  };

  // Face ID kræver koden én gang. Den tjekkes mod serveren, før den gemmes bag Face ID.
  const bekraeft = async () => {
    if (kode.length < 4) { setFejl("Skriv din kode."); return; }
    const butikNr = butik?.nummer ? String(butik.nummer) : "";
    if (!butikNr || !profil?.brugernavn) { setFejl("Butiksnummer eller brugernavn mangler. Log ud og ind igen."); return; }
    setOptaget(true);
    const svar = await loginMedKode({ butik: butikNr, brugernavn: profil.brugernavn, pin: kode });
    if (!svar.ok) { setOptaget(false); setFejl(svar.fejl || "Forkert kode."); return; }
    const ok = await slaaBiometriTil({ butik: butikNr, brugernavn: profil.brugernavn, pin: kode });
    setOptaget(false);
    if (!ok) { setFejl(`${bio?.navn || "Face ID"} kunne ikke slås til.`); return; }
    setSpoerger(false); setKode("");
    onBioAendret(true);
  };

  return (
    <Modal visible={synlig} transparent animationType="slide" onRequestClose={luk}>
      <KeyboardAvoidingView style={s.bagside} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={s.luft} onPress={luk} accessibilityLabel="Luk" />
        <View style={[s.ark, { paddingBottom: 20 + insets.bottom }]}>
          <View style={s.hoved}>
            <Text style={s.titel}>Min konto</Text>
            <Pressable onPress={luk} style={s.luk} accessibilityRole="button" accessibilityLabel="Luk" hitSlop={8}>
              <Ionicons name="close" size={24} color={farver.ink} />
            </Pressable>
          </View>
          <Text style={s.navn}>{profil?.navn}</Text>
          <Text style={s.under}>{ROLLER[profil?.rolle] || profil?.rolle}{butik?.navn ? ` · ${butik.navn}` : ""}</Text>

          {bio?.tilgaengelig ? (
            <View style={s.sektion}>
              <View style={s.raekke}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.etiket}>Log ind med {bio.navn}</Text>
                  <Text style={s.hjaelp}>Appen åbner med {bio.navn} i stedet for at du skriver din kode.</Text>
                </View>
                <Switch value={!!bioAktiv || spoerger} onValueChange={skift} trackColor={{ true: farver.brand }} accessibilityLabel={`Log ind med ${bio.navn}`} />
              </View>
              {spoerger ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={s.hjaelp}>Skriv din kode én gang for at slå {bio.navn} til.</Text>
                  <TextInput value={kode} onChangeText={(v) => setKode(v.replace(/\s/g, ""))} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Kode" placeholderTextColor={farver.svag} style={s.felt} returnKeyType="done" onSubmitEditing={bekraeft} />
                  {fejl ? <Text style={s.fejl}>{fejl}</Text> : null}
                  <Knap titel="Slå til" onPress={bekraeft} optaget={optaget} />
                  <Knap titel="Annuller" variant="tekst" onPress={() => { setSpoerger(false); setKode(""); setFejl(""); }} />
                </View>
              ) : fejl ? <Text style={s.fejl}>{fejl}</Text> : null}
            </View>
          ) : null}

          <Knap titel="Log ud" variant="sekundaer" ikon="log-out-outline" onPress={() => { luk(); onLogUd(); }} style={{ marginTop: 18 }} />
          <Text style={s.version}>Version {Constants.expoConfig?.version || ""}</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  bagside: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  luft: { flex: 1 },
  ark: { backgroundColor: farver.hvid, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, width: "100%", maxWidth: 560, alignSelf: "center" },
  hoved: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titel: { fontSize: 13, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", color: farver.daempet },
  luk: { width: minTryk, height: minTryk, alignItems: "center", justifyContent: "center", marginRight: -10 },
  navn: { fontSize: 24, fontWeight: "800", color: farver.ink },
  under: { fontSize: 15, color: farver.daempet, marginTop: 2 },
  sektion: { marginTop: 18, padding: 14, borderRadius: radius.m, backgroundColor: farver.panel, borderWidth: 1, borderColor: farver.skillelinje },
  raekke: { flexDirection: "row", alignItems: "center" },
  etiket: { fontSize: 16, fontWeight: "700", color: farver.ink },
  hjaelp: { fontSize: 13, color: farver.daempet, marginTop: 2, lineHeight: 18 },
  felt: { minHeight: minTryk, borderWidth: 1.5, borderColor: farver.linje, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 17, color: farver.ink, backgroundColor: farver.hvid, marginVertical: 10 },
  fejl: { color: farver.fare, fontSize: 14, marginBottom: 8 },
  version: { textAlign: "center", color: farver.svag, fontSize: 12, marginTop: 14 },
});
