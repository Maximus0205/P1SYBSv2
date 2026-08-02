import { BrowserRouter, Routes, Route } from "react-router-dom";
import SagListePage from "./pages/SagListePage";
import SagView from "./components/SagView";
import SagDele from "./components/SagDele";
import AfstandsForslag from "./components/AfstandsForslag";
import SagKortKompakt from "./components/SagKortKompakt";
import CsvImport from "./components/CsvImport";
import KvitteringUpload from "./components/KvitteringUpload";
import NyeSagForm from "./components/NyeSagForm";

export default function App() {
  return (
    <BrowserRouter basename="/P1SYBSv2">
      <Routes>
        <Route path="/" element={<SagListePage />} />
        <Route path="/sag/:id" element={<SagView />} />
        <Route path="/dele/:id" element={<SagDele />} />
        <Route path="/forslag" element={<AfstandsForslag />} />
        <Route path="/kort" element={<SagKortKompakt />} />
        <Route path="/import" element={<CsvImport />} />
        <Route path="/upload" element={<KvitteringUpload />} />
        <Route path="/ny" element={<NyeSagForm />} />
      </Routes>
    </BrowserRouter>
  );
}
