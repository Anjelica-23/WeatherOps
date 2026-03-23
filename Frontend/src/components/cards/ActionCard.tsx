import type { ActionDecision } from "../../types/impact";

interface ActionCardProps {
  action: ActionDecision;
  selected: boolean;
  onClick: () => void;
}

const SEVERITY_STYLES = {
  high:   "bg-red-500/20 text-red-400 border-red-500/40",
  medium: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  low:    "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
};

const SEVERITY_DOT = {
  high:   "bg-red-500",
  medium: "bg-orange-400",
  low:    "bg-yellow-300",
};

const HAZARD_EMOJI: Record<string, string> = {
  FLOOD:     "🌊",
  HEAT:      "🔥",
  WIND:      "💨",
  LANDSLIDE: "⛰",
};

export default function ActionCard({ action, selected, onClick }: ActionCardProps) {
  const loc      = action.locations[0];
  const severity = loc?.severity ?? "low";
  const emoji    = HAZARD_EMOJI[action.hazard?.toUpperCase()] ?? "⚠️";

  // location name: prefer action.where, fallback to loc.location_name, fallback to coords
  const locationName =
    action.where && action.where !== "Dehradun Zone"
      ? action.where
      : loc?.location_name && loc.location_name !== ""
      ? loc.location_name
      : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition
        ${selected
          ? "border-blue-500 bg-blue-500/10"
          : "border-zinc-800 hover:border-zinc-600 bg-zinc-900/50"
        }`}
    >
      {/* Title + severity badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm leading-tight">
          {emoji} {action.title}
        </h3>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${SEVERITY_STYLES[severity]}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${SEVERITY_DOT[severity]}`} />
          {severity}
        </span>
      </div>

      {/* Hazard type */}
      <div className="text-xs text-blue-400 font-medium mb-2 uppercase tracking-wide">
        {action.hazard}
      </div>

      {/* Location name — prominent */}
      {locationName && (
        <div className="text-xs text-teal-400 font-medium mb-1">
          📍 {locationName}
        </div>
      )}

      {/* Coordinates — secondary, always shown */}
      {loc && (
        <div className="text-xs text-zinc-500 mb-2">
          {loc.lat.toFixed(4)}°N, {loc.lon.toFixed(4)}°E
        </div>
      )}

      {/* When + confidence */}
      <div className="flex justify-between text-xs text-zinc-500 mt-1">
        <span>{action.when}</span>
        <span className="text-zinc-400">
          {Math.round(action.confidence[0] * 100)}–
          {Math.round(action.confidence[1] * 100)}% conf
        </span>
      </div>
    </button>
  );
}