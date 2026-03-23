import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="h-16 px-6 flex items-center justify-between border-b border-zinc-800 bg-black">
      <div className="flex items-center gap-2 text-lg font-semibold">
        🌦️ WeatherOps
      </div>

      <nav className="flex items-center gap-6">
        {["/", "/reports", "/about"].map((path, i) => {
          const label = ["Dashboard", "Reports", "About"][i];
          return (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `px-3 py-1 rounded-md text-sm transition ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="text-sm text-green-400 flex items-center gap-2">
        ● System Online
      </div>
    </header>
  );
}
