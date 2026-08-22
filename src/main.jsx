import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./styles/globals.css";

// HashRouter (ikke BrowserRouter): GitHub Pages serverer kun statiske filer
// uden server-side rewrites - et refresh på en "rigtig" sti som
// /P1SYBSv2/planlaegning ville give en 404, medmindre der er sat en
// særlig fallback op. Hash-delen af en URL ("#/planlaegning") sendes
// ALDRIG til serveren, så et refresh altid indlæser den samme index.html
// uanset hvilken fane man var på, hvorefter React Router selv læser
// hashet og gengiver den rigtige side. Se App.jsx for selve rute-opsætningen.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
