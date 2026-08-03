import { BrowserRouter, Routes, Route } from "react-router-dom";

import AdminSide from "./pages/AdminSide.jsx";
import KoerselSide from "./pages/KoerselSide.jsx";
import LagerSide from "./pages/LagerSide.jsx";
import MontorSide from "./pages/MontorSide.jsx";
import SalgSide from "./pages/SalgSide.jsx";


export default function App() {
  return (
    <BrowserRouter basename="/P1SYBSv2">
      <Routes>
        {/* Forside */}
        <Route path="/" element={<MontorSide />} />

        {/* Dine andre sider */}
        <Route path="/admin" element={<AdminSide />} />
        <Route path="/koersel" element={<KoerselSide />} />
        <Route path="/lager" element={<LagerSide />} />
        <Route path="/salg" element={<SalgSide />} />
      </Routes>
    </BrowserRouter>
  );
}
