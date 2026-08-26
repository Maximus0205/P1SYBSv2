import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { logError } from "./lib/errorLog";
import "./index.css";
import "./styles/globals.css";

// Global fejl-opsamling (august 2026): fanger UVENTEDE JS-fejl og
// ubehandlede løfte-afvisninger et hvilket som helst sted i appen, uden
// brugeren selv skal gøre noget - se lib/errorLog.js (selve logningen) og
// den nye fejl-log under fanen System (kun synlig for systemadmin).
// Supplerer ErrorBoundary nedenfor, som kun fanger fejl der opstår UNDER
// selve React-renderingen - disse to lyttere fanger desuden fejl i almindelig
// JavaScript-kode og afviste løfter (fx et Supabase-kald der fejler uden
// at blive fanget lokalt).
window.addEventListener("error", (e) => {
  logError("window.onerror", e.error || e.message, { filename: e.filename, lineno: e.lineno, colno: e.colno });
});
window.addEventListener("unhandledrejection", (e) => {
  logError("unhandledrejection", e.reason);
});

// HashRouter (ikke BrowserRouter): GitHub Pages serverer kun statiske filer
// uden server-side rewrites - et refresh på en "rigtig" sti som
// /P1SYBSv2/planlaegning ville give en 404, medmindre der er sat en
// særlig fallback op. Hash-delen af en URL ("#/planlaegning") sendes
// ALDRIG til serveren, så et refresh altid indlæser den samme index.html
// uanset hvilken fane man var på, hvorefter React Router selv læser
// hashet og gengiver den rigtige side. Se App.jsx for selve rute-opsætningen.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
