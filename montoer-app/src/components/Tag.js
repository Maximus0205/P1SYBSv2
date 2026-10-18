import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { farver, radius } from "../theme";

// Lille mærkat. variant "fyldt" = hvid tekst på farven (bruges til "2 mand"), "kant" = farvet kant og tekst.
export function Tag({ label, farve, variant = "kant", ikon }) {
  const fyldt = variant === "fyldt";
  return (
    <View style={[s.tag, fyldt ? { backgroundColor: farve } : { borderColor: farve, borderWidth: 1.5 }]} accessible accessibilityLabel={label}>
      {ikon ? <Ionicons name={ikon} size={12} color={fyldt ? farver.hvid : farve} style={s.ikon} /> : null}
      <Text style={[s.tekst, { color: fyldt ? farver.hvid : farve }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tag: { flexDirection: "row", alignItems: "center", borderRadius: radius.s, paddingHorizontal: 8, paddingVertical: 3 },
  ikon: { marginRight: 4 },
  tekst: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
});
