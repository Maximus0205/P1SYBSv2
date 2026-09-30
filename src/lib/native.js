// NATIVE APP-LAG (Capacitor) - se docs/MONTOER-APP.md.
//
// Alt her er bevidst en no-op i browseren (GitHub Pages-udgaven), så den
// samme kodebase kan køre begge steder. isNative() er den ene kontakt.
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

export const isNative = () => Capacitor.isNativePlatform();

export async function initNative() {
  if (!isNative()) return;

  // Lys baggrund i appen -> mørk tekst i statuslinjen.
  try {
    await StatusBar.setStyle({ style: Style.Light });
  } catch (_) {
    // Statuslinjen er kosmetik - må aldrig forhindre appen i at starte.
  }

  // Android: hardware-tilbageknappen skal gå et skridt tilbage i appens
  // egen historik (HashRouter), og kun lukke appen fra første side.
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
}
