// components/ImpactMap.tsx
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
  GeoJSON,
} from "react-leaflet";

import { useEffect, useState, useMemo } from "react";
import L from "leaflet";
import type { ActionDecision } from "../../types/impact";
import {
  fetchROIBoundary,
  fetchDehradunBlocks,
} from "../../services/api";

import axios from "axios";

import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import "./impactMap.css";
import { API_BASE } from "../../config";

interface HazardPoint {
  lat: number;
  lon: number;
  prob: number;
  heat_risk: number;
  wind_risk: number;
  landslide_risk: number;
}

// ============================================================
// Helper: fly to selected action
// ============================================================
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

// ============================================================
// Heatmap Layer Component
// ============================================================
function HeatmapLayer({ visible, points }: { visible: boolean; points: [number, number, number][] }) {
  const map = useMap();

  useEffect(() => {
    let heatLayer: L.HeatLayer | null = null;
    if (visible && points.length > 0) {
      // Scale and filter
      const filteredPoints = points.filter(([,, intensity]) => intensity > 0.05);
      const scaledPoints: [number, number, number][] = filteredPoints.map(([lat, lon, intensity]) => {
        // Boost low values and spread them across 0-1 range
        let boosted = intensity * 1.8;
        if (boosted > 1) boosted = 1;
        // Apply a power curve to lift lower intensities further
        const scaled = Math.pow(boosted, 0.6);
        return [lat, lon, scaled];
      });

      heatLayer = L.heatLayer(scaledPoints, {
        radius: 20,
        blur: 10,
        maxZoom: 17,
        minOpacity: 0.4,
        gradient: {
          0.0: '#00c9a7',   // LOW
          0.5: '#f0a500',   // MODERATE
          1.0: '#f06830',   // HIGH

        }
      });
      heatLayer.addTo(map);
    }
    return () => {
      if (heatLayer) {
        map.removeLayer(heatLayer);
      }
    };
  }, [visible, points, map]);

  return null;
}

// ============================================================
// Pulse icon for high‑risk markers
// ============================================================
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
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const HAZARD_EMOJI: Record<string, string> = {
  FLOOD: "🌊",
  HEAT: "🔥",
  WIND: "💨",
  LANDSLIDE: "⛰️",
};

// ============================================================
// Block colors (exactly as in Streamlit)
// ============================================================
const BLOCK_COLORS: Record<string, string> = {
  Tyuni: "#f2a5b0",
  Chakrata: "#f0a060",
  Kalsi: "#60c8e8",
  Vikasnagar: "#e8c840",
  Dehradun: "#90d060",
  Doiwala: "#c8e040",
  Rishikesh: "#a8d948",
};

// ============================================================
// Helper: convert risk score (0-1) to colour
// ============================================================
function riskColor(score: number): string {
  if (score >= 0.75) return "#e84040";
  if (score >= 0.5) return "#f06830";
  if (score >= 0.25) return "#f0a500";
  return "#00c9a7";
}

function riskLabel(score: number): string {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.5) return "HIGH";
  if (score >= 0.25) return "MODERATE";
  return "LOW";
}

function normalizeBlockName(name: string): string {
  if (!name) return "Dehradun";
  const lower = name.toLowerCase().replace(/\s+/g, "");
  if (lower.includes("tyuni")) return "Tyuni";
  if (lower.includes("chakrata")) return "Chakrata";
  if (lower.includes("kalsi")) return "Kalsi";
  if (lower.includes("vikas")) return "Vikasnagar";
  if (lower.includes("dehradun")) return "Dehradun";
  if (lower.includes("doiwala")) return "Doiwala";
  if (lower.includes("rishikesh")) return "Rishikesh";
  return "Dehradun";
}

// ============================================================
// Main component
// ============================================================
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
  const [blocks, setBlocks] = useState<any>(null);
  const [blockRisk, setBlockRisk] = useState<Record<string, any>>({});
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState<[number, number, number][]>([]);
  const [allPoints, setAllPoints] = useState<HazardPoint[]>([]);

  // Fetch boundaries and block risk on mount
  useEffect(() => {
    fetchROIBoundary().then(setROIBoundary).catch(console.error);
    fetchDehradunBlocks().then(setBlocks).catch(console.error);
    axios
      .get(`${API_BASE}/api/block_risk`)
      .then((res: any) => setBlockRisk(res.data))
      .catch(console.error);
  }, []);

  // Fetch all points once (contains flood, heat, wind, landslide risks)
  useEffect(() => {
    axios
      .get(`${API_BASE}/api/flood_heatmap`)
      .then((res) => {
        const points: HazardPoint[] = res.data.points;
        setAllPoints(points);
      })
      .catch(console.error);
  }, []);

  // Update heatmap points when hazard changes or allPoints changes
  useEffect(() => {
    if (!allPoints.length) return;
    let riskKey: keyof HazardPoint = "prob";
    switch (hazard) {
      case "FLOOD":
        riskKey = "prob";
        break;
      case "HEAT":
        riskKey = "heat_risk";
        break;
      case "WIND":
        riskKey = "wind_risk";
        break;
      case "LANDSLIDE":
        riskKey = "landslide_risk";
        break;
      default:
        riskKey = "prob";
    }
    const heatPoints: [number, number, number][] = allPoints.map((p) => [p.lat, p.lon, p[riskKey]]);
    setHeatmapPoints(heatPoints);
  }, [hazard, allPoints]);

  // Compute tehsil clusters for block tooltips
  const tehsilClusters = useMemo(() => {
    if (!blocks || !actions.length) return {};

    const clusters: Record<string, { count: number; sumRisk: number }> = {};

    actions.forEach((action) => {
      action.locations.forEach((loc) => {
        const point = L.latLng(loc.lat, loc.lon);
        let owner: string | null = null;
        for (const feature of blocks.features) {
          const geom = feature.geometry;
          if (isPointInPolygon(point, geom)) {
            const rawName =
              feature.properties?.shapeName ||
              feature.properties?.block ||
              feature.properties?.name;
            owner = normalizeBlockName(rawName);
            break;
          }
        }
        if (owner) {
          if (!clusters[owner]) clusters[owner] = { count: 0, sumRisk: 0 };
          const risk = (action.confidence[0] + action.confidence[1]) / 2;
          clusters[owner].count++;
          clusters[owner].sumRisk += risk;
        }
      });
    });

    const result: Record<string, { count: number; avgRisk: number }> = {};
    for (const [name, data] of Object.entries(clusters)) {
      result[name] = {
        count: data.count,
        avgRisk: data.sumRisk / data.count,
      };
    }
    return result;
  }, [actions, blocks]);

  // Block style – dynamic fill opacity based on heatmap visibility
  const blockStyle = useMemo(() => {
    return (feature: any) => {
      const rawName =
        feature.properties?.shapeName ||
        feature.properties?.block ||
        feature.properties?.name;
      const canonical = normalizeBlockName(rawName);
      const fillColor = BLOCK_COLORS[canonical] || "#8a93a8";
      const cluster = tehsilClusters[canonical];
      const hasPoints = cluster && cluster.count > 0;

      // When heatmap is visible, make fill almost transparent
      const fillOpacity = heatmapVisible
        ? 0.05
        : hasPoints
        ? 0.34
        : 0.08;

      return {
        color: "#7a9af2",
        weight: 0.5,
        fillColor: fillColor,
        fillOpacity: fillOpacity,
      };
    };
  }, [heatmapVisible, tehsilClusters]);

  const onEachBlock = (feature: any, layer: any) => {
    const rawName =
      feature.properties?.shapeName ||
      feature.properties?.block ||
      feature.properties?.name ||
      "Block";
    const canonical = normalizeBlockName(rawName);

    const cluster = tehsilClusters[canonical] || { count: 0, avgRisk: 0 };
    const br = blockRisk[canonical] || { flood: 0, heat: 0, wind: 0, landslide: 0 };

    const blockInfo: Record<string, { area: string; villages: string; notes: string }> = {
      Tyuni: {
        area: "520 km²",
        villages: "118",
        notes: "Upper Tons highland tehsil · remote ridge settlements",
      },
      Chakrata: {
        area: "960 km²",
        villages: "294",
        notes: "Upper-mid highland tehsil · Jaunsar-Bawar terrain belt",
      },
      Kalsi: {
        area: "267 km²",
        villages: "98",
        notes: "Transitional mid-hill tehsil · Yamuna-Tons corridor",
      },
      Vikasnagar: {
        area: "697 km²",
        villages: "231",
        notes: "Western valley tehsil · Herbertpur-Selaqui belt",
      },
      Dehradun: {
        area: "790 km²",
        villages: "307",
        notes: "Central basin tehsil · urban core and peri-urban east",
      },
      Doiwala: {
        area: "260 km²",
        villages: "95",
        notes: "South-western plains tehsil · Song-Suswa corridor",
      },
      Rishikesh: {
        area: "312 km²",
        villages: "120",
        notes: "South-eastern tehsil · Ganga corridor and foothill floodplain",
      },
    };
    const info = blockInfo[canonical] || { area: "—", villages: "—", notes: "" };

    const avgRisk = cluster.avgRisk || 0;
    const pointCount = cluster.count || 0;

    const hazardRows = (hazards: { name: string; emoji: string; score: number }[]) => {
      return hazards
        .map(({ name, emoji, score }) => {
          const percent = Math.round(score * 100);
          const color = riskColor(score);
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:11px;">${emoji}</span>
                <span style="font-size:9px;color:#8a93a8;">${name}</span>
              </div>
              <div style="flex:1;margin:0 8px;height:4px;background:#1e2230;border-radius:2px;">
                <div style="width:${percent}%;height:4px;background:${color};border-radius:2px;"></div>
              </div>
              <span style="font-size:9px;font-weight:600;color:${color};">${percent}%</span>
            </div>
          `;
        })
        .join("");
    };

    const hazardList = [
      { name: "Flood", emoji: "🌊", score: br.flood || 0 },
      { name: "Heat", emoji: "🔥", score: br.heat || 0 },
      { name: "Wind", emoji: "💨", score: br.wind || 0 },
      { name: "Landslide", emoji: "⛰", score: br.landslide || 0 },
    ];

    let dominant = "";
    let maxScore = 0;
    for (const h of hazardList) {
      if (h.score > maxScore) {
        maxScore = h.score;
        dominant = h.name;
      }
    }
    const domColor = riskColor(maxScore);
    const domLabel = riskLabel(maxScore);

    const tooltipHtml = `
      <div style="background:#111318;border:1px solid ${riskColor(
        avgRisk
      )};border-radius:6px;padding:10px 14px;min-width:210px;max-width:260px;">
        <div style="font-size:13px;font-weight:700;color:${riskColor(
          avgRisk
        )};margin-bottom:5px;">${canonical} Tehsil</div>
        <div style="font-size:9px;color:#8a93a8;margin-bottom:8px;line-height:1.6;">${
          info.notes
        }</div>
        <div style="display:flex;justify-content:space-between;font-size:9px;">
          <span style="color:#4e5568;">Area <b style="color:#8a93a8;">${
            info.area
          }</b></span>
          <span style="color:#4e5568;">Villages <b style="color:#8a93a8;">${
            info.villages
          }</b></span>
        </div>
        <div style="margin-top:6px;font-size:9px;color:#4e5568;">
          Avg Risk <b style="color:${riskColor(avgRisk)};">${avgRisk.toFixed(
      2
    )}</b>
          · Points <b style="color:#8a93a8;">${pointCount}</b>
        </div>
        <hr style="border-color:#2a2f3d;margin:8px 0 4px;">
        <div style="font-size:9px;color:#4e5568;margin-bottom:4px;">Hazard Risk</div>
        ${hazardRows(hazardList)}
        <hr style="border-color:#2a2f3d;margin:8px 0 4px;">
        <div style="margin-top:5px;">
          <span style="font-size:9px;color:#4e5568;">Dominant Risk: </span>
          <span style="font-size:10px;font-weight:700;color:${domColor};">${dominant} — ${domLabel}</span>
        </div>
      </div>
    `;

    layer.bindTooltip(tooltipHtml, { sticky: true });
  };

  const highIcon = createPulseIcon("#ff2244", 24);
  const highIconSel = createPulseIcon("#ff6680", 32);

  function isPointInPolygon(point: L.LatLng, geom: any): boolean {
    if (geom.type === "Polygon") {
      return pointInPolygon(point, geom.coordinates[0]);
    } else if (geom.type === "MultiPolygon") {
      return geom.coordinates.some((poly: any) => pointInPolygon(point, poly[0]));
    }
    return false;
  }

  function pointInPolygon(point: L.LatLng, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0],
        yi = ring[i][1];
      const xj = ring[j][0],
        yj = ring[j][1];
      const intersect =
        yi > point.lat != yj > point.lat &&
        point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

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
        maxBounds={[
          [29.7, 77.4],
          [31.2, 78.8],
        ]}
        maxBoundsViscosity={0.2}
      >
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {blocks && (
          <GeoJSON
            key={JSON.stringify(blockRisk) + JSON.stringify(tehsilClusters) + heatmapVisible}
            data={blocks}
            style={blockStyle}
            onEachFeature={onEachBlock}
          />
        )}

        {roiBoundary && (
          <GeoJSON
            data={roiBoundary}
            style={{
              color: "#00ffff",
              weight: 1.5,
              fillOpacity: 0,
              dashArray: "5, 5",
            }}
          />
        )}

        <FlyToAction actions={actions} selectedActionId={selectedActionId} />

        {/* Only show markers when heatmap is NOT visible */}
        {!heatmapVisible &&
          actions.flatMap((action) =>
            action.locations
              .filter((loc) => severityFilter === "all" || loc.severity === severityFilter)
              .map((loc) => {
                const isSelected = selectedActionId === action.id;
                const emoji = HAZARD_EMOJI[action.hazard?.toUpperCase()] ?? "⚠️";
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
                        loc.severity === "high"
                          ? "#ff2244"
                          : loc.severity === "medium"
                          ? "#ffcc00"
                          : "#00e676"
                      }">${loc.severity.toUpperCase()}</strong>
                    </div>
                    <div style="color:#aaa;font-size:11px;margin-top:2px">
                      ⏱ ${action.when}
                    </div>
                    <div style="color:#aaa;font-size:11px">
                      Confidence: ${Math.round(action.confidence[0] * 100)}–${Math.round(
                  action.confidence[1] * 100
                )}%
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

                const color = loc.severity === "medium" ? "#ffcc00" : "#00e676";
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

        {/* Heatmap layer */}
        <HeatmapLayer visible={heatmapVisible} points={heatmapPoints} />
      </MapContainer>

      {/* Legend panel (bottom-left) */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-black/85 text-white text-xs rounded-lg p-3 border border-zinc-700 backdrop-blur-sm">
        <div className="font-semibold mb-2 uppercase tracking-widest text-zinc-400 text-[10px]">
          {hazard} · {severityFilter === "all" ? "All Severity" : severityFilter.toUpperCase()}
        </div>
        <div
          className={`flex items-center gap-2 mb-1.5 transition ${
            severityFilter !== "all" && severityFilter !== "high" ? "opacity-30" : ""
          }`}
        >
          <span className="w-3 h-3 rounded-full bg-[#ff2244] shadow-[0_0_8px_#ff2244] animate-pulse" />
          <span>High — pulsating</span>
        </div>
        <div
          className={`flex items-center gap-2 mb-1.5 transition ${
            severityFilter !== "all" && severityFilter !== "medium" ? "opacity-30" : ""
          }`}
        >
          <span className="w-3 h-3 rounded-full bg-[#ffcc00] shadow-[0_0_6px_#ffcc00]" />
          <span>Medium</span>
        </div>
        <div
          className={`flex items-center gap-2 transition ${
            severityFilter !== "all" && severityFilter !== "low" ? "opacity-30" : ""
          }`}
        >
          <span className="w-3 h-3 rounded-full bg-[#00e676] shadow-[0_0_6px_#00e676]" />
          <span>Low</span>
        </div>
      </div>

      {/* Heatmap toggle button (bottom-right) */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-black/85 text-white text-xs rounded-lg p-3 border border-zinc-700 backdrop-blur-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={heatmapVisible}
            onChange={(e) => setHeatmapVisible(e.target.checked)}
          />
          <span>Heatmap Overlay</span>
        </label>
      </div>
    </div>
  );
}