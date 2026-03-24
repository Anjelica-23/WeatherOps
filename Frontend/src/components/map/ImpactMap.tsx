import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
  GeoJSON,
} from "react-leaflet";

import { useEffect, useState } from "react";
import L from "leaflet";
import type { ActionDecision } from "../../types/impact";
import {
  fetchROIBoundary,
  fetchDehradunBlocks,
} from "../../services/api";

import "leaflet/dist/leaflet.css";
import "./impactMap.css";

function FlyToAction({
  actions,
  selectedActionId,
}: {
  actions: ActionDecision[];
  selectedActionId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedActionId) return;
    const action = actions.find((a) => a.id === selectedActionId);
    if (!action || action.locations.length === 0) return;
    const { lat, lon } = action.locations[0];
    map.flyTo([lat, lon], 13, { duration: 1.2 });
  }, [selectedActionId, actions, map]);

  return null;
}

function createPulseIcon(color: string, size: number) {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        <div style="
          position:absolute;inset:0;
          border-radius:50%;
          background:${color};
          opacity:0.25;
          animation:pulseRing 1.8s ease-out infinite;
        "></div>
        <div style="
          position:absolute;
          top:50%;left:50%;
          transform:translate(-50%,-50%);
          width:${size * 0.5}px;height:${size * 0.5}px;
          border-radius:50%;
          background:${color};
          box-shadow:0 0 8px ${color};
        "></div>
      </div>`,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const HAZARD_EMOJI: Record<string, string> = {
  FLOOD:     "🌊",
  HEAT:      "🔥",
  WIND:      "💨",
  LANDSLIDE: "⛰️",
};

export default function ImpactMap({
  actions,
  selectedActionId,
  onSelectAction,
  hazard,
  severityFilter,
}: {
  actions: ActionDecision[];
  selectedActionId: string | null;
  onSelectAction: (id: string) => void;
  hazard: "ALL" | "FLOOD" | "HEAT" | "WIND" | "LANDSLIDE";
  severityFilter: "all" | "high" | "medium" | "low";
}) {
  const [roiBoundary, setROIBoundary] = useState<any>(null);
  const [blocks, setBlocks]           = useState<any>(null);

  useEffect(() => {
    fetchROIBoundary().then(setROIBoundary).catch(console.error);
    fetchDehradunBlocks().then(setBlocks).catch(console.error);
  }, []);

  const BLOCK_COLORS: Record<string, string> = {
    "Chakrata":    "#8B3A2B",
    "Kalsi":       "#8B3A2B",
    "Vikasnagar":  "#C2A83E",
    "Doiwala":     "#1F7A6E",
    "Raipur":      "#1F7A6E",
    "Sahaspur":    "#1F7A6E",
    "Dehradun":    "#1F7A6E"
  };

  const highIcon    = createPulseIcon("#ff2244", 24);
  const highIconSel = createPulseIcon("#ff6680", 32);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[30.3165, 78.0322]}
        zoom={11}
        minZoom={9}
        maxZoom={16}
        scrollWheelZoom={true}
        zoomAnimation={true}
        style={{ width: "100%", height: "100%" }}
        maxBounds={[[29.8, 77.5], [30.9, 78.6]]}
        maxBoundsViscosity={0.2}
      >
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {blocks && (
          <GeoJSON
            data={blocks}
            style={(feature: any) => {
              const name =
                feature.properties?.shapeName ||
                feature.properties?.block ||
                feature.properties?.name;

              return {
                color: "#ffffff",
                weight: 2,
                fillColor: BLOCK_COLORS[name] || "#1F7A6E",
                fillOpacity: 0.7,
              };
            }}
            onEachFeature={(feature: any, layer: any) => {
              const name =
                feature.properties?.shapeName ||
                feature.properties?.block ||
                feature.properties?.name ||
                "Block";

              layer.bindTooltip(`
                <div style="font-family:monospace;font-size:12px">
                  <strong>${name}</strong>
                </div>
              `, { sticky: true });
            }}
          />
        )}

        {roiBoundary && (
          <GeoJSON
            data={roiBoundary}
            style={{ color: "#00ffff", weight: 2, fillOpacity: 0 }}
          />
        )}

        <FlyToAction actions={actions} selectedActionId={selectedActionId} />

        {actions.flatMap((action) =>
          action.locations
            .filter((loc) =>
              severityFilter === "all" || loc.severity === severityFilter
            )
            .map((loc) => {
              const isSelected   = selectedActionId === action.id;
              const emoji        = HAZARD_EMOJI[action.hazard?.toUpperCase()] ?? "⚠️";
              const locationName = loc.location_name || action.where || "Dehradun Zone";

              const tooltipContent = `
                <div style="font-family:monospace;font-size:12px;line-height:1.8;min-width:200px">
                  <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#fff">
                    ${emoji} ${action.title}
                  </div>
                  <div style="color:#00c9a7;margin-bottom:2px">
                    📍 ${locationName}
                  </div>
                  <div style="color:#aaa">
                    ${loc.lat.toFixed(4)}°N, ${loc.lon.toFixed(4)}°E
                  </div>
                  <hr style="border-color:#333;margin:4px 0"/>
                  <div style="color:#60a5fa;text-transform:uppercase;font-size:11px;letter-spacing:.08em">
                    ${action.hazard}
                  </div>
                  <div style="margin-top:2px">
                    Severity: <strong style="color:${
                      loc.severity === "high"   ? "#ff2244" :
                      loc.severity === "medium" ? "#ffcc00" : "#00e676"
                    }">${loc.severity.toUpperCase()}</strong>
                  </div>
                  <div style="color:#aaa;font-size:11px;margin-top:2px">
                    ⏱ ${action.when}
                  </div>
                  <div style="color:#aaa;font-size:11px">
                    Confidence: ${Math.round(action.confidence[0] * 100)}–${Math.round(action.confidence[1] * 100)}%
                  </div>
                </div>`;

              if (loc.severity === "high") {
                return (
                  <Marker
                    key={loc.id}
                    position={[loc.lat, loc.lon]}
                    icon={isSelected ? highIconSel : highIcon}
                    eventHandlers={{ click: () => onSelectAction(action.id) }}
                    zIndexOffset={isSelected ? 1000 : 500}
                  >
                    <Tooltip direction="top" opacity={1} sticky offset={[0, -8]}>
                      <div dangerouslySetInnerHTML={{ __html: tooltipContent }} />
                    </Tooltip>
                  </Marker>
                );
              }

              const color  = loc.severity === "medium" ? "#ffcc00" : "#00e676";
              const radius = isSelected ? 9 : loc.severity === "medium" ? 6 : 5;

              return (
                <CircleMarker
                  key={loc.id}
                  center={[loc.lat, loc.lon]}
                  radius={radius}
                  pathOptions={{
                    fillColor: color,
                    color: isSelected ? "#ffffff" : color,
                    weight: isSelected ? 2.5 : 1,
                    fillOpacity: isSelected ? 1 : 0.8,
                  }}
                  eventHandlers={{ click: () => onSelectAction(action.id) }}
                >
                  <Tooltip direction="top" opacity={1} sticky offset={[0, -4]}>
                    <div dangerouslySetInnerHTML={{ __html: tooltipContent }} />
                  </Tooltip>
                </CircleMarker>
              );
            })
        )}
      </MapContainer>

      <div className="absolute bottom-4 left-4 z-[1000] bg-black/85 text-white text-xs rounded-lg p-3 border border-zinc-700 backdrop-blur-sm">
        <div className="font-semibold mb-2 uppercase tracking-widest text-zinc-400 text-[10px]">
          {hazard} · {severityFilter === "all" ? "All Severity" : severityFilter.toUpperCase()}
        </div>
        <div className={`flex items-center gap-2 mb-1.5 transition ${severityFilter !== "all" && severityFilter !== "high" ? "opacity-30" : ""}`}>
          <span className="w-3 h-3 rounded-full bg-[#ff2244] shadow-[0_0_8px_#ff2244] animate-pulse" />
          <span>High — pulsating</span>
        </div>
        <div className={`flex items-center gap-2 mb-1.5 transition ${severityFilter !== "all" && severityFilter !== "medium" ? "opacity-30" : ""}`}>
          <span className="w-3 h-3 rounded-full bg-[#ffcc00] shadow-[0_0_6px_#ffcc00]" />
          <span>Medium</span>
        </div>
        <div className={`flex items-center gap-2 transition ${severityFilter !== "all" && severityFilter !== "low" ? "opacity-30" : ""}`}>
          <span className="w-3 h-3 rounded-full bg-[#00e676] shadow-[0_0_6px_#00e676]" />
          <span>Low</span>
        </div>
      </div>
    </div>
  );
}