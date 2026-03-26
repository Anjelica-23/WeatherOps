import { Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import About from "./pages/About";
import MapPage from "./pages/MapPage";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* GLOBAL NAVBAR */}
      <Navbar />

      {/* ROUTED PAGES */}
      <main className="pt-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/about" element={<About />} />
          <Route path="/map" element={<MapPage />} />
        </Routes>
      </main>
    </div>
  );
}
