import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { langDato } from "../lib/dato";
import { STATUS_META, TOMGANG_COLOR, erTomgang, kortFraSag, linjeTekst, navigationsUrl, noegleTekst, telefonLink } from "../lib/rute";
import { farver, minTryk, radius } from "../theme";
import { Tag } from "../components/Tag";
import { aabnLink } from "../components/Sagskort";

// Sagens detaljer. Kun visning: status og tidsregistrering ændres i webappen, indtil appen kan skrive sikkert.
export function SagScreen({ sag, onTilbage, visTilbage, bundMargin = 0 }) {
  if (!sag) {
    return (
      <View style={[s.tom, { paddingBottom: bundMargin }]}>
        <Ionicons name="document-text-outline" size={44} color={farver.svag} />
        <Text style={s.tomTekst}>Vælg en sag på ruten for at se detaljerne.</Text>
      </View>
    );
  }
  const kort = kortFraSag(sag);
  const status = STATUS_META[kort.status];
  const noegle = noegleTekst(sag.noegle);
  const navUrl = navigationsUrl(sag, Platform.OS);
  const tel = telefonLink(sag.kunde?.telefon);
  const koeber = sag.koeber;
  const koeberTel = telefonLink(koeber?.telefon);
  const linjer = (sag.varelinjer || []).map(linjeTekst).filter(Boolean);

  return (
    <View style={s.rod}>
      {visTilbage ? (
        <Pressable onPress={onTilbage} style={s.tilbage} accessibilityRole="button" accessibilityLabel="Tilbage til ruten" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={farver.hvid} />
          <Text style={s.tilbageTekst}>Ruten</Text>
        </Pressable>
      ) : null}
      <ScrollView contentContainerStyle={[s.indhold, { paddingBottom: 24 + bundMargin }]}>
        {kort.toMand ? (
          <View style={s.toMand} accessible accessibilityRole="alert" accessibilityLabel="Kræver to mand">
            <Ionicons name="people" size={26} color={farver.hvid} />
            <View style={{ flex: 1 }}>
              <Text style={s.toMandTitel}>Kræver to mand</Text>
              <Text style={s.toMandTekst}>Opgaven er tung eller besværlig og skal løses sammen med en medhjælper.</Text>
            </View>
          </View>
        ) : null}

        <View style={s.toppe}>
          <Text style={s.tid}>{sag.dato ? langDato(sag.dato) : ""}{kort.tid ? ` · ${kort.tid}` : ""}</Text>
          <View style={s.markRaekke}>
            {erTomgang(sag) ? <Tag label="Tomgang" farve={TOMGANG_COLOR} ikon="key-outline" /> : null}
            <Tag label={status.label} farve={status.color} />
          </View>
        </View>
        <Text style={s.titel}>{kort.titel}</Text>
        <Text style={s.nr}>Sag #{kort.nr ?? "–"}{sag.ordrenummer ? ` · Ordre ${sag.ordrenummer}` : ""}</Text>

        <Sektion titel={erTomgang(sag) ? "Rekvirent" : "Kunde"}>
          <Text style={s.navn}>{sag.kunde?.navn || "–"}</Text>
          {sag.kunde?.telefon ? <Text style={s.linje}>{sag.kunde.telefon}</Text> : null}
          {sag.kunde?.email ? <Text style={s.linje}>{sag.kunde.email}</Text> : null}
          {sag.kunde?.adresse ? <Text style={[s.linje, { marginTop: 6 }]}>{sag.kunde.adresse}</Text> : null}
          <View style={s.knapper}>
            {tel ? <Handling ikon="call" tekst="Ring" onPress={() => aabnLink(tel)} /> : null}
            {navUrl ? <Handling ikon="navigate" tekst="Kør hertil" onPress={() => aabnLink(navUrl)} /> : null}
          </View>
        </Sektion>

        {sag.kunde?.leveringsnote ? (
          <Sektion titel="Note til levering">
            <Text style={[s.linje, { color: farver.brand, fontWeight: "600" }]}>{sag.kunde.leveringsnote}</Text>
          </Sektion>
        ) : null}

        {noegle ? (
          <Sektion titel="Nøgle og adgang">
            <Text style={[s.linje, { fontWeight: "600" }]}>{noegle}</Text>
            {sag.noegle?.detaljer ? <Text style={s.linje}>{sag.noegle.detaljer}</Text> : null}
          </Sektion>
        ) : null}

        <Sektion titel={linjer.length === 1 ? "Opgave" : "Opgaver"}>
          {linjer.length === 0 ? <Text style={s.linje}>Ingen opgaver på sagen.</Text> : linjer.map((t, i) => (
            <View key={i} style={s.linjeRaekke}>
              <View style={s.prik} />
              <Text style={[s.linje, { flex: 1 }]}>{t}</Text>
            </View>
          ))}
        </Sektion>

        {koeber?.navn ? (
          <Sektion titel="Køber">
            <Text style={s.navn}>{koeber.navn}</Text>
            {koeber.telefon ? <Text style={s.linje}>{koeber.telefon}</Text> : null}
            {koeber.adresse ? <Text style={s.linje}>{koeber.adresse}</Text> : null}
            {koeberTel ? <View style={s.knapper}><Handling ikon="call" tekst="Ring til køber" onPress={() => aabnLink(koeberTel)} /></View> : null}
          </Sektion>
        ) : null}

        <Text style={s.fod}>Status og tidsregistrering ændres i webappen. Appen viser kun sagen.</Text>
      </ScrollView>
    </View>
  );
}

function Sektion({ titel, children }) {
  return (
    <View style={s.sektion}>
      <Text style={s.sektionTitel}>{titel}</Text>
      {children}
    </View>
  );
}

function Handling({ ikon, tekst, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tekst} style={({ pressed }) => [s.handling, pressed && { backgroundColor: farver.paper }]}>
      <Ionicons name={ikon} size={19} color={farver.brand} />
      <Text style={s.handlingTekst}>{tekst}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  rod: { flex: 1, backgroundColor: farver.paper },
  tom: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: farver.paper },
  tomTekst: { marginTop: 12, fontSize: 15, color: farver.daempet, textAlign: "center" },
  tilbage: { flexDirection: "row", alignItems: "center", backgroundColor: farver.ink, paddingHorizontal: 8, minHeight: minTryk },
  tilbageTekst: { color: farver.hvid, fontSize: 16, fontWeight: "600" },
  indhold: { padding: 16 },
  toMand: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: farver.brand, borderRadius: radius.m, padding: 14, marginBottom: 16 },
  toMandTitel: { color: farver.hvid, fontSize: 17, fontWeight: "800" },
  toMandTekst: { color: "#FBE3E5", fontSize: 13, marginTop: 2, lineHeight: 18 },
  toppe: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  tid: { fontSize: 14, color: farver.daempet, fontWeight: "600" },
  markRaekke: { flexDirection: "row", gap: 6 },
  titel: { fontSize: 22, fontWeight: "800", color: farver.ink, marginTop: 10, lineHeight: 28 },
  nr: { fontSize: 13, color: farver.svag, marginTop: 4 },
  sektion: { backgroundColor: farver.hvid, borderRadius: radius.l, padding: 16, marginTop: 14, borderWidth: 1, borderColor: farver.skillelinje },
  sektionTitel: { fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", color: farver.daempet, marginBottom: 8 },
  navn: { fontSize: 18, fontWeight: "700", color: farver.ink },
  linje: { fontSize: 15, color: farver.ink, lineHeight: 21 },
  linjeRaekke: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 4 },
  prik: { width: 6, height: 6, borderRadius: 3, backgroundColor: farver.brand, marginTop: 8 },
  knapper: { flexDirection: "row", gap: 10, marginTop: 14 },
  handling: { flex: 1, minHeight: minTryk, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: farver.linje, borderRadius: radius.m, backgroundColor: farver.hvid },
  handlingTekst: { fontSize: 14, fontWeight: "700", color: farver.brand },
  fod: { fontSize: 12, color: farver.svag, textAlign: "center", marginTop: 20 },
});
