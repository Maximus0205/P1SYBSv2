import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STATUS_META, TOMGANG_COLOR, navigationsUrl, telefonLink } from "../lib/rute";
import { farver, minTryk, radius, skygge } from "../theme";
import { Tag } from "./Tag";

export async function aabnLink(url) {
  if (!url) return;
  try { await Linking.openURL(url); } catch { /* ingen app kan åbne linket */ }
}

// Ét stop på ruten. Hele kortet åbner sagen; "Ring" og "Kør hertil" er egne, store knapper.
export function Sagskort({ kort, sag, valgt, onAabn }) {
  const status = STATUS_META[kort.status];
  const tel = telefonLink(kort.telefon);
  const navUrl = navigationsUrl(sag, Platform.OS);
  return (
    <View style={[s.kort, valgt && s.valgt]}>
      <View style={[s.bar, { backgroundColor: status.color }]} />
      <Pressable
        onPress={onAabn}
        style={s.indhold}
        accessibilityRole="button"
        accessibilityLabel={`${kort.tid}, ${kort.titel}, ${kort.kunde}${kort.toMand ? ", kræver to mand" : ""}`}
      >
        <View style={s.toppe}>
          <Text style={s.tid}>{kort.tid}</Text>
          {kort.nr != null ? <Text style={s.nr}>#{kort.nr}</Text> : null}
          <View style={s.mark}>
            {kort.toMand ? <Tag label="2 mand" farve={farver.brand} variant="fyldt" ikon="people" /> : null}
            {kort.tomgang ? <Tag label="Tomgang" farve={TOMGANG_COLOR} ikon="key-outline" /> : null}
            <Tag label={status.label} farve={status.color} />
          </View>
        </View>
        <Text style={s.titel} numberOfLines={3}>{kort.titel}</Text>
        {kort.kunde ? <Text style={s.kunde} numberOfLines={1}>{kort.kunde}</Text> : null}
        {kort.adresse ? (
          <View style={s.adresseRaekke}>
            <Ionicons name="location-outline" size={15} color={farver.daempet} />
            <Text style={s.adresse} numberOfLines={2}>{kort.adresse}</Text>
          </View>
        ) : null}
        {kort.problem ? (
          <View style={s.adresseRaekke}>
            <Ionicons name="warning-outline" size={15} color={farver.fare} />
            <Text style={[s.adresse, { color: farver.fare, fontWeight: "600" }]}>Markeret: kom ikke i mål</Text>
          </View>
        ) : null}
      </Pressable>
      {tel || navUrl ? (
        <View style={s.handlinger}>
          {tel ? <Handling ikon="call" tekst="Ring" onPress={() => aabnLink(tel)} /> : null}
          {navUrl ? <Handling ikon="navigate" tekst="Kør hertil" onPress={() => aabnLink(navUrl)} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function Handling({ ikon, tekst, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tekst} style={({ pressed }) => [s.handling, pressed && { backgroundColor: farver.paper }]}>
      <Ionicons name={ikon} size={18} color={farver.brand} />
      <Text style={s.handlingTekst}>{tekst}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  kort: { backgroundColor: farver.hvid, borderRadius: radius.l, marginHorizontal: 12, marginBottom: 10, overflow: "hidden", borderWidth: 1, borderColor: farver.skillelinje, ...skygge },
  valgt: { borderColor: farver.brand, borderWidth: 2 },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  indhold: { paddingVertical: 14, paddingLeft: 18, paddingRight: 14 },
  toppe: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 8 },
  tid: { fontSize: 16, fontWeight: "800", color: farver.ink, fontVariant: ["tabular-nums"] },
  nr: { fontSize: 12, color: farver.svag, marginLeft: 8, fontVariant: ["tabular-nums"] },
  mark: { flexDirection: "row", flexWrap: "wrap", marginLeft: "auto", gap: 6 },
  titel: { fontSize: 16, fontWeight: "700", color: farver.ink, lineHeight: 21 },
  kunde: { fontSize: 15, color: farver.ink, marginTop: 4 },
  adresseRaekke: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 4 },
  adresse: { flex: 1, fontSize: 14, color: farver.daempet, lineHeight: 19 },
  handlinger: { flexDirection: "row", borderTopWidth: 1, borderTopColor: farver.skillelinje },
  handling: { flex: 1, minHeight: minTryk, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  handlingTekst: { fontSize: 14, fontWeight: "700", color: farver.brand },
});
