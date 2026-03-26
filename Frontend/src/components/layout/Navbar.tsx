import { NavLink } from "react-router-dom";

interface NavbarProps {
  backendStatus?: "online" | "offline";
  onExport?: () => void;
  isExporting?: boolean;
}

export default function Navbar({
  backendStatus = "online",
  onExport,
  isExporting = false,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 bg-[#111318] border-b border-[#2a2f3d] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-2xl">⛈️</span>
        <span className="text-2xl font-bold">WeatherOps</span>
      </div>

      <nav className="flex items-center gap-6">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `px-3 py-1 rounded-md text-sm transition ${
              isActive ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
            }`
          }
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/map"
          className={({ isActive }) =>
            `px-3 py-1 rounded-md text-sm transition ${
              isActive ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
            }`
          }
        >
          Map View
        </NavLink>
        <NavLink
          to="/reports"
          className={({ isActive }) =>
            `px-3 py-1 rounded-md text-sm transition ${
              isActive ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
            }`
          }
        >
          Reports
        </NavLink>
        <NavLink
          to="/about"
          className={({ isActive }) =>
            `px-3 py-1 rounded-md text-sm transition ${
              isActive ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
            }`
          }
        >
          About
        </NavLink>
      </nav>

      <div className="flex items-center gap-6 text-sm">
        <span className="text-emerald-400 flex items-center gap-1">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          System {backendStatus === "online" ? "Online" : "Offline"}
        </span>
        {onExport && (
          <button
            onClick={onExport}
            disabled={isExporting}
            className="bg-amber-600 px-4 py-1 rounded-full text-xs font-medium hover:bg-amber-700 transition"
          >
            {isExporting ? "Exporting..." : "📄 Export PDF"}
          </button>
        )}
      </div>
    </header>
  );
}