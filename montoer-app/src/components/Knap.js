import React from "react";
import { ActivityIndicator, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { farver, minTryk, radius } from "../theme";

// variant: "primaer" (rød), "sekundaer" (hvid med kant), "tekst" (kun tekst)
export function Knap({ titel, onPress, variant = "primaer", ikon, optaget, deaktiveret, stor, style, accessibilityLabel }) {
  const primaer = variant === "primaer";
  const tekst = variant === "tekst";
  const inaktiv = deaktiveret || optaget;
  const tekstFarve = primaer ? farver.hvid : tekst ? farver.daempet : farver.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={inaktiv}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || titel}
      accessibilityState={{ disabled: !!inaktiv, busy: !!optaget }}
      style={({ pressed }) => [
        s.knap,
        stor && s.stor,
        primaer && { backgroundColor: pressed ? farver.brandMoerk : farver.brand },
        variant === "sekundaer" && { backgroundColor: pressed ? farver.paper : farver.hvid, borderWidth: 1.5, borderColor: farver.linje },
        tekst && { backgroundColor: "transparent", minHeight: 40 },
        inaktiv && { opacity: 0.55 },
        style,
      ]}
    >
      {optaget ? (
        <ActivityIndicator color={tekstFarve} />
      ) : (
        <>
          {ikon ? <Ionicons name={ikon} size={stor ? 20 : 18} color={tekstFarve} style={s.ikon} /> : null}
          <Text style={[s.tekst, stor && s.tekstStor, { color: tekstFarve }, tekst && { fontWeight: "600", textTransform: "none", letterSpacing: 0 }]}>{titel}</Text>
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  knap: { minHeight: minTryk, borderRadius: radius.m, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  stor: { minHeight: 56 },
  ikon: { marginRight: 8 },
  tekst: { fontSize: 14, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  tekstStor: { fontSize: 15 },
});
