import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { idag, erIdag, dagITal, ugedagKort, laegDage, overskriftDato, langDato } from "../lib/dato";
import { farver, radius } from "../theme";

// Øverst: forrige/næste dag og "I dag". Under: ugens syv dage med antal sager, så man kan hoppe direkte.
export function Dagvaelger({ dato, onVaelg, antalPerDag, dage }) {
  return (
    <View style={s.boks}>
      <View style={s.raekke}>
        <Pil retning="venstre" onPress={() => onVaelg(laegDage(dato, -1))} label="Forrige dag" />
        <Pressable onPress={() => onVaelg(idag())} style={s.midte} accessibilityRole="button" accessibilityLabel="Gå til i dag">
          <Text style={s.overskrift}>{overskriftDato(dato)}</Text>
          {!erIdag(dato) ? <Text style={s.undertekst}>{langDato(dato)} · tryk for i dag</Text> : <Text style={s.undertekst}>{langDato(dato)}</Text>}
        </Pressable>
        <Pil retning="hoejre" onPress={() => onVaelg(laegDage(dato, 1))} label="Næste dag" />
      </View>
      <View style={s.uge}>
        {dage.map((d) => {
          const valgt = d === dato;
          const antal = antalPerDag[d] || 0;
          return (
            <Pressable
              key={d}
              onPress={() => onVaelg(d)}
              style={[s.dag, valgt && s.dagValgt, erIdag(d) && !valgt && s.dagIdag]}
              accessibilityRole="button"
              accessibilityState={{ selected: valgt }}
              accessibilityLabel={`${langDato(d)}, ${antal} ${antal === 1 ? "sag" : "sager"}`}
            >
              <Text style={[s.ugedag, valgt && s.hvid]}>{ugedagKort(d)}</Text>
              <Text style={[s.dagTal, valgt && s.hvid]}>{dagITal(d)}</Text>
              <Text style={[s.antal, valgt && s.hvid, antal === 0 && !valgt && { color: farver.svag }]}>{antal > 0 ? antal : "–"}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Pil({ retning, onPress, label }) {
  return (
    <Pressable onPress={onPress} style={s.pil} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Ionicons name={retning === "venstre" ? "chevron-back" : "chevron-forward"} size={22} color={farver.hvid} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  boks: { backgroundColor: farver.ink, paddingBottom: 12 },
  raekke: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  pil: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  midte: { flex: 1, alignItems: "center", paddingVertical: 4 },
  overskrift: { color: farver.hvid, fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  undertekst: { color: "#BBBBBB", fontSize: 12, marginTop: 2 },
  uge: { flexDirection: "row", paddingHorizontal: 8, marginTop: 6 },
  dag: { flex: 1, marginHorizontal: 3, paddingVertical: 8, borderRadius: radius.m, alignItems: "center", backgroundColor: "#2A2A2A", minHeight: 64 },
  dagValgt: { backgroundColor: farver.brand },
  dagIdag: { borderWidth: 1.5, borderColor: farver.brand },
  ugedag: { color: "#BBBBBB", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  dagTal: { color: farver.hvid, fontSize: 18, fontWeight: "800", marginTop: 1 },
  antal: { color: "#BBBBBB", fontSize: 11, fontWeight: "600", marginTop: 1 },
  hvid: { color: farver.hvid },
});
