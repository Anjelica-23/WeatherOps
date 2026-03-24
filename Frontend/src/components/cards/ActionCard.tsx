// components/cards/ActionCard.tsx
import type { ActionDecision } from "../../types/impact";

interface ActionCardProps {
  action: ActionDecision;
  selected: boolean;
  onClick: () => void;
}

const SEVERITY_STYLES = {
  high: "bg-red-500/20 text-red-400 border-red-500/50",
  medium: "bg-orange-500/20 text-orange-400 border-orange-500/50",
  low: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
};

const SEVERITY_DOT = {
  high: "bg-red-500",
  medium: "bg-orange-400",
  low: "bg-yellow-400",
};

const HAZARD_EMOJI: Record<string, string> = {
  FLOOD: "🌊",
  HEAT: "🔥",
  WIND: "💨",
  LANDSLIDE: "⛰️",
};

export default function ActionCard({ action, selected, onClick }: ActionCardProps) {
  const loc = action.locations[0];
  const severity = loc?.severity ?? "low";
  const emoji = HAZARD_EMOJI[action.hazard?.toUpperCase()] ?? "⚠️";

  const locationName = action.where && action.where !== "Dehradun Zone"
    ? action.where
    : loc?.location_name || "Dehradun Zone";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 group
        ${selected
          ? "border-blue-500 bg-blue-500/10 shadow-xl shadow-blue-500/20"
          : "border-[#2a2f3d] hover:border-[#4a5568] bg-[#181b22] hover:bg-[#1f242f]"
        }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{emoji}</span>
          <h3 className="font-semibold leading-tight text-base pr-2">
            {action.title}
          </h3>
        </div>

        <span
          className={`shrink-0 px-3 py-1 text-xs font-medium rounded-full border capitalize ${SEVERITY_STYLES[severity]}`}
        >
          <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SEVERITY_DOT[severity]}`} />
          {severity}
        </span>
      </div>

      <div className="text-blue-400 text-sm font-medium mb-2">
        {action.hazard}
      </div>

      <div className="text-teal-400 text-sm mb-3">
        📍 {locationName}
      </div>

      {loc && (
        <div className="text-xs text-zinc-500 mb-4 font-mono">
          {loc.lat.toFixed(4)}°N, {loc.lon.toFixed(4)}°E
        </div>
      )}

      <div className="flex justify-between items-center text-xs">
        <span className="text-zinc-400">{action.when}</span>
        <span className="text-zinc-500 font-mono">
          {Math.round(action.confidence[0] * 100)}–{Math.round(action.confidence[1] * 100)}% conf
        </span>
      </div>
    </button>
  );
}