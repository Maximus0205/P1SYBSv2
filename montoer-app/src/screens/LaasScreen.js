import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { bekraeftMedBiometri } from "../lib/auth";
import { farver } from "../theme";
import { Knap } from "../components/Knap";

// Vises, når appen åbnes eller har været væk et stykke tid, og Face ID er slået til. Spørger med det samme.
export function LaasScreen({ bioNavn, onLaasOp, onLogUd }) {
  const [optaget, setOptaget] = useState(false);
  const aktiv = useRef(true);

  const laasOp = async () => {
    setOptaget(true);
    const ok = await bekraeftMedBiometri("Lås P1SYBS op");
    if (!aktiv.current) return;
    setOptaget(false);
    if (ok) onLaasOp();
  };

  useEffect(() => {
    aktiv.current = true;
    laasOp();
    return () => { aktiv.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.rod}>
      <StatusBar style="light" />
      <View style={s.logo}><Text style={s.logoTal}>1</Text></View>
      <Text style={s.titel}>P1SYBS er låst</Text>
      <Text style={s.tekst}>Bekræft med {bioNavn || "Face ID"} for at fortsætte.</Text>
      <View style={s.knapper}>
        <Knap titel={`Lås op med ${bioNavn || "Face ID"}`} ikon="lock-open-outline" onPress={laasOp} optaget={optaget} stor />
        <Knap titel="Log ud" variant="tekst" onPress={onLogUd} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  rod: { flex: 1, backgroundColor: farver.ink, alignItems: "center", justifyContent: "center", padding: 24 },
  logo: { width: 72, height: 72, borderRadius: 36, backgroundColor: farver.brand, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#E8E8E8" },
  logoTal: { color: farver.hvid, fontSize: 44, fontWeight: "900", marginTop: -2 },
  titel: { color: farver.hvid, fontSize: 26, fontWeight: "800", marginTop: 20 },
  tekst: { color: "#BBBBBB", fontSize: 15, marginTop: 8, textAlign: "center" },
  knapper: { width: "100%", maxWidth: 360, marginTop: 28 },
});
