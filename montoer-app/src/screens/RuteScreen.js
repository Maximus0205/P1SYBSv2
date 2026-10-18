import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { bilForDag, hentUge } from "../lib/api";
import { idag, ugensDage } from "../lib/dato";
import { antalFaerdige, kortFraSag, sagerForDag } from "../lib/rute";
import { farver, minTryk } from "../theme";
import { Dagvaelger } from "../components/Dagvaelger";
import { Knap } from "../components/Knap";
import { Sagskort } from "../components/Sagskort";
import { SagScreen } from "./SagScreen";

const BREDDE_TABLET = 720;
const GENINDLAES_EFTER_MS = 60 * 1000;

// Dagens rute. Montøren starter her: dagens sager i rækkefølge, dagvælger, og tryk på en sag åbner detaljerne.
// På tablet står ruten til venstre og sagen til højre.
export function RuteScreen({ profil, butik, onKonto }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bred = width >= BREDDE_TABLET;

  const [dato, setDato] = useState(idag());
  const [uger, setUger] = useState({}); // { "2026-10-19": ugedata }
  const [indlaeser, setIndlaeser] = useState(true);
  const [opdaterer, setOpdaterer] = useState(false);
  const [fejl, setFejl] = useState("");
  const [valgtId, setValgtId] = useState(null);
  const sidstHentet = useRef(0);

  const dage = useMemo(() => ugensDage(dato), [dato]);
  const ugeNoegle = dage[0];
  const uge = uger[ugeNoegle] || null;

  const hent = useCallback(async (datoForUge, { stille } = {}) => {
    const noegle = ugensDage(datoForUge)[0];
    if (!stille) setIndlaeser(true);
    try {
      const data = await hentUge({ profil, dato: datoForUge });
      sidstHentet.current = Date.now();
      setUger((u) => ({ ...u, [noegle]: data }));
      setFejl("");
    } catch (e) {
      setFejl("Ruten kunne ikke hentes. Tjek forbindelsen og træk ned for at prøve igen.");
    } finally {
      setIndlaeser(false);
      setOpdaterer(false);
    }
  }, [profil]);

  // Hent ugen første gang den vises.
  useEffect(() => {
    if (!uger[ugeNoegle]) hent(dato);
    else setIndlaeser(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ugeNoegle]);

  // Frisk rute, når appen kommer tilbage i forgrunden.
  useEffect(() => {
    const abo = AppState.addEventListener("change", (tilstand) => {
      if (tilstand === "active" && Date.now() - sidstHentet.current > GENINDLAES_EFTER_MS) hent(dato, { stille: true });
    });
    return () => abo.remove();
  }, [hent, dato]);

  const bilId = bilForDag(profil, uge, dato);
  const sager = useMemo(() => (uge && bilId ? sagerForDag(uge.sager, bilId, dato) : []), [uge, bilId, dato]);
  const kort = useMemo(() => sager.map(kortFraSag), [sager]);
  const valgtSag = sager.find((s) => String(s.id) === valgtId) || null;
  const bil = uge?.biler?.find((b) => b.id === bilId);

  const antalPerDag = useMemo(() => {
    const ud = {};
    dage.forEach((d) => {
      const b = bilForDag(profil, uge, d);
      ud[d] = uge && b ? sagerForDag(uge.sager, b, d).length : 0;
    });
    return ud;
  }, [dage, profil, uge]);

  const vaelgDato = (d) => { setValgtId(null); setDato(d); };

  // Android: tilbageknappen lukker en åben sag, før den lukker appen.
  useEffect(() => {
    if (!valgtSag || bred) return undefined;
    const abo = BackHandler.addEventListener("hardwareBackPress", () => { setValgtId(null); return true; });
    return () => abo.remove();
  }, [valgtSag, bred]);

  const tomBesked = !bilId
    ? (profil.rolle === "medhjaelper" || !profil.bilId
        ? "Du er ikke sat på en bil denne dag endnu. Prøv en anden dag, eller tjek igen senere."
        : "Din bruger er ikke koblet til en bil endnu. Bed en administrator om at tildele dig en bil.")
    : "Ingen sager på din bil denne dag.";

  const liste = (
    <View style={s.listeBoks}>
      <FlatList
        data={kort}
        keyExtractor={(k) => k.id}
        renderItem={({ item, index }) => (
          <Sagskort kort={item} sag={sager[index]} valgt={bred && valgtId === item.id} onAabn={() => setValgtId(item.id)} />
        )}
        refreshControl={<RefreshControl refreshing={opdaterer} onRefresh={() => { setOpdaterer(true); hent(dato, { stille: true }); }} tintColor={farver.brand} colors={[farver.brand]} />}
        ListHeaderComponent={
          <View>
            {uge?.fraCache ? (
              <View style={s.offline} accessibilityRole="alert">
                <Ionicons name="cloud-offline-outline" size={18} color="#7A5200" />
                <Text style={s.offlineTekst}>Ingen forbindelse. Viser ruten, som den så ud kl. {klokken(uge.hentet)}.</Text>
              </View>
            ) : null}
            {fejl && !uge ? <Text style={s.fejl}>{fejl}</Text> : null}
            {kort.length > 0 ? (
              <Text style={s.oversigt}>{kort.length} {kort.length === 1 ? "sag" : "sager"} · {antalFaerdige(sager)} færdigmeldt</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          indlaeser ? (
            <View style={s.midt}><ActivityIndicator size="large" color={farver.brand} /></View>
          ) : fejl && !uge ? (
            <View style={s.midt}><Knap titel="Prøv igen" onPress={() => hent(dato)} variant="sekundaer" /></View>
          ) : (
            <View style={s.midt}>
              <Ionicons name="checkmark-circle-outline" size={44} color={farver.svag} />
              <Text style={s.tomTekst}>{tomBesked}</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 + insets.bottom, flexGrow: 1 }}
      />
    </View>
  );

  return (
    <View style={s.rod}>
      <StatusBar style="light" />
      <View style={[s.top, { paddingTop: insets.top + 6 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.appNavn}>P1SYBS</Text>
          <Text style={s.bruger} numberOfLines={1}>{profil.navn}{bil?.navn ? ` · ${bil.navn}` : ""}</Text>
        </View>
        <Pressable onPress={onKonto} style={s.konto} accessibilityRole="button" accessibilityLabel="Min konto" hitSlop={6}>
          <Ionicons name="person-circle-outline" size={30} color={farver.hvid} />
        </Pressable>
      </View>
      <Dagvaelger dato={dato} onVaelg={vaelgDato} antalPerDag={antalPerDag} dage={dage} />

      {bred ? (
        <View style={s.split}>
          <View style={s.venstre}>{liste}</View>
          <View style={s.hoejre}>
            <SagScreen sag={valgtSag} bundMargin={insets.bottom} />
          </View>
        </View>
      ) : valgtSag ? (
        <SagScreen sag={valgtSag} visTilbage onTilbage={() => setValgtId(null)} bundMargin={insets.bottom} />
      ) : (
        liste
      )}
    </View>
  );
}

function klokken(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}.${p(d.getMinutes())}`;
}

const s = StyleSheet.create({
  rod: { flex: 1, backgroundColor: farver.paper },
  top: { backgroundColor: farver.ink, paddingHorizontal: 16, paddingBottom: 4, flexDirection: "row", alignItems: "center" },
  appNavn: { color: farver.brand, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  bruger: { color: farver.hvid, fontSize: 17, fontWeight: "700", marginTop: 1 },
  konto: { width: minTryk, height: minTryk, alignItems: "center", justifyContent: "center", marginRight: -8 },
  listeBoks: { flex: 1 },
  split: { flex: 1, flexDirection: "row" },
  venstre: { flex: 5, borderRightWidth: 1, borderRightColor: farver.linje },
  hoejre: { flex: 6 },
  oversigt: { fontSize: 13, color: farver.daempet, fontWeight: "600", marginHorizontal: 16, marginBottom: 10 },
  midt: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, minHeight: 240 },
  tomTekst: { marginTop: 12, fontSize: 15, color: farver.daempet, textAlign: "center", lineHeight: 21 },
  offline: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#FFF3D6", marginHorizontal: 12, marginBottom: 10, padding: 12, borderRadius: 10 },
  offlineTekst: { flex: 1, color: "#7A5200", fontSize: 13, lineHeight: 18 },
  fejl: { color: farver.fare, marginHorizontal: 16, marginBottom: 10, fontSize: 14 },
});
