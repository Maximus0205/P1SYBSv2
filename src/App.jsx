import { BrowserRouter, Routes, Route } from "react-router-dom";

import AdminSide from "./pages/main/AdminSide.jsx";
import KoerselSide from "./pages/main/KoerselSide.jsx";
import LagerSide from "./pages/main/LagerSide.jsx";
import MontorSide from "./pages/main/MontorSide.jsx";
import SalgSide from "./pages/main/SalgSide.jsx";

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
