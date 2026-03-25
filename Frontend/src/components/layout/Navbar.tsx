import { NavLink } from "react-router-dom";

interface NavbarProps {
  backendStatus: "online" | "offline";
  lastUpdated: string;
  onExport: () => void;
  isExporting: boolean;
}

export default function Navbar({
  backendStatus,
  lastUpdated,
  onExport,
  isExporting,
}: NavbarProps) {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="bg-[#111318] border-b border-[#2a2f3d] px-6 py-3 flex items-center justify-between">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">⛈️</span>
        <span className="text-2xl font-bold">WeatherOps</span>
      </div>

      {/* Navigation */}
      <nav className="flex items-center gap-6">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `px-3 py-1 rounded-md text-sm transition ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`
          }
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/reports"
          className={({ isActive }) =>
            `px-3 py-1 rounded-md text-sm transition ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`
          }
        >
          Reports
        </NavLink>
        <NavLink
          to="/about"
          className={({ isActive }) =>
            `px-3 py-1 rounded-md text-sm transition ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`
          }
        >
          About
        </NavLink>
      </nav>

      {/* Right‑hand info */}
      <div className="flex items-center gap-6 text-sm">
        <span className="text-emerald-400 flex items-center gap-1">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          System {backendStatus === "online" ? "Online" : "Offline"}
        </span>
        <span className="font-mono">Now: {now}</span>
        <span className="font-mono">Last Updated: {lastUpdated}</span>
        <button
          onClick={onExport}
          disabled={isExporting}
          className="bg-amber-600 px-4 py-1 rounded-full text-xs font-medium hover:bg-amber-700 transition"
        >
          {isExporting ? "Exporting..." : "📄 Export PDF"}
        </button>
      </div>
    </header>
  );
}