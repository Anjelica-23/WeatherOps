import { useEffect, useState } from "react";
import axios from "axios";
import ImpactMap from "../components/map/ImpactMap";
import ActionCard from "../components/cards/ActionCard";
import { fetchDecisions, fetchMetrics } from "../services/api";
import type { ActionDecision } from "../types/impact";
import MetricCard from "../components/cards/MetricCard";
import BlockRiskGrid from "../components/BlockRiskGrid";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

type HazardType = "ALL" | "FLOOD" | "HEAT" | "WIND" | "LANDSLIDE";
type SeverityFilter = "all" | "high" | "medium" | "low";
type Tab = "RECOMMENDATIONS" | "FORECAST TIMESERIES" | "RAW DATA" | "EVALUATION AGENT" | "AGENT TRACE";

interface ForecastPoint {
  time: string;
  rain_mm: number;
  rain_adj: number;
  temp_c: number;
  wind_kmph: number;
  heat_index: number;
  flood_proxy: number;
  app_temp: number;
}

interface RiskEvolution {
  time: string[];
  flood: number[];
  heat: number[];
  wind: number[];
  landslide: number[];
}

interface SeasonalContext {
  month: number;
  season: string;
  color: string;
  summary: string;
  hazards: { Flood: string; Heat: string; Wind: string; Landslide: string };
  callout: string;
}

interface Recommendation {
  id: string;
  hazard: string;
  level: "critical" | "high" | "moderate" | "low";
  title: string;
  body: string;
  actions: string[];
  preventiveActions: string[];
  forecastBasis: string;
  confidence: [number, number];
}

interface EvaluationResult {
  hazard: string;
  display: string;
  task: "clf" | "reg";
  n_train: number;
  n_test: number;
  best_model: string;
  models: Record<string, any>;
  features: string[];
  roc_data?: { fpr: number[]; tpr: number[]; auc: number };
}

interface AgentStep {
  idx: string;
  agent: string;
  message: string;
  status: "ok" | "warn" | "err";
}

const API_BASE = "https://weatherops-production.up.railway.app";
const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const SEASONAL_RISKS: Record<number, SeasonalContext> = {
  1: {
    month: 1,
    season: "Winter",
    color: "#00c9a7",
    summary: "Mid-winter — lowest annual hazard period. Monitor western disturbances for cold wave risk.",
    hazards: { Flood: "LOW", Heat: "LOW", Wind: "LOW", Landslide: "LOW" },
    callout: "",
  },
  2: {
    month: 2,
    season: "Late Winter",
    color: "#00c9a7",
    summary: "Late winter — western disturbances bring pre-season winds. Snowmelt begins on high ridges.",
    hazards: { Flood: "LOW", Heat: "LOW", Wind: "MODERATE", Landslide: "LOW" },
    callout: "",
  },
  3: {
    month: 3,
    season: "Pre-Summer",
    color: "#f0a500",
    summary: "Pre-summer — temperatures rising fast. Heat risk building in urban core (Paltan Bazaar, Dalanwala).",
    hazards: { Flood: "LOW", Heat: "MODERATE", Wind: "MODERATE", Landslide: "LOW" },
    callout:
      "<div style='margin-top:.7rem;background:rgba(240,104,48,.08);border:1px solid rgba(240,104,48,.3);border-radius:5px;padding:.55rem .8rem;font-family:\"JetBrains Mono\",monospace;font-size:.68rem;color:#f06830;line-height:1.7;'>☀ <b>Summer / Pre-Monsoon Season</b> — Urban heat island peaks in Dehradun tehsil. Paltan Bazaar and Dalanwala face highest heat-health risk. Ensure cooling centres are operational before noon.</div>",
  },
  4: {
    month: 4,
    season: "Summer",
    color: "#f06830",
    summary: "Summer peak — urban heat island in full effect. Doiwala, Raiwala, and Rishikesh face max thermal load.",
    hazards: { Flood: "LOW", Heat: "HIGH", Wind: "MODERATE", Landslide: "LOW" },
    callout:
      "<div style='margin-top:.7rem;background:rgba(240,104,48,.08);border:1px solid rgba(240,104,48,.3);border-radius:5px;padding:.55rem .8rem;font-family:\"JetBrains Mono\",monospace;font-size:.68rem;color:#f06830;line-height:1.7;'>☀ <b>Summer / Pre-Monsoon Season</b> — Urban heat island peaks in Dehradun tehsil. Paltan Bazaar and Dalanwala face highest heat-health risk. Ensure cooling centres are operational before noon.</div>",
  },
  5: {
    month: 5,
    season: "Pre-Monsoon",
    color: "#f06830",
    summary: "Pre-monsoon — peak heat with thunderstorm risk. Isolated hailstorms possible in Vikasnagar belt.",
    hazards: { Flood: "LOW", Heat: "HIGH", Wind: "MODERATE", Landslide: "LOW" },
    callout:
      "<div style='margin-top:.7rem;background:rgba(240,104,48,.08);border:1px solid rgba(240,104,48,.3);border-radius:5px;padding:.55rem .8rem;font-family:\"JetBrains Mono\",monospace;font-size:.68rem;color:#f06830;line-height:1.7;'>☀ <b>Summer / Pre-Monsoon Season</b> — Urban heat island peaks in Dehradun tehsil. Paltan Bazaar and Dalanwala face highest heat-health risk. Ensure cooling centres are operational before noon.</div>",
  },
  6: {
    month: 6,
    season: "Early Monsoon",
    color: "#60a5fa",
    summary: "Monsoon onset — Rispana & Bindal rivers begin rising. Pre-position flood response teams.",
    hazards: { Flood: "HIGH", Heat: "MODERATE", Wind: "MODERATE", Landslide: "HIGH" },
    callout:
      "<div style='margin-top:.7rem;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.3);border-radius:5px;padding:.55rem .8rem;font-family:\"JetBrains Mono\",monospace;font-size:.68rem;color:#60a5fa;line-height:1.7;'>🌧 <b>Monsoon Season Active</b> — Flood and landslide risk elevated. Rispana, Bindal, and Song river catchments require continuous monitoring. NH-707 (Chakrata) prone to debris slides during sustained rainfall events.</div>",
  },
  7: {
    month: 7,
    season: "Peak Monsoon",
    color: "#e84040",
    summary: "Peak monsoon — highest flood & landslide risk. NH-707 closures likely. Full EOC activation.",
    hazards: { Flood: "CRITICAL", Heat: "LOW", Wind: "HIGH", Landslide: "CRITICAL" },
    callout:
      "<div style='margin-top:.7rem;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.3);border-radius:5px;padding:.55rem .8rem;font-family:\"JetBrains Mono\",monospace;font-size:.68rem;color:#60a5fa;line-height:1.7;'>🌧 <b>Monsoon Season Active</b> — Flood and landslide risk elevated. Rispana, Bindal, and Song river catchments require continuous monitoring. NH-707 (Chakrata) prone to debris slides during sustained rainfall events.</div>",
  },
  8: {
    month: 8,
    season: "Peak Monsoon",
    color: "#e84040",
    summary: "Sustained monsoon — cumulative soil saturation maximises landslide probability on slopes >25°.",
    hazards: { Flood: "CRITICAL", Heat: "LOW", Wind: "MODERATE", Landslide: "HIGH" },
    callout:
      "<div style='margin-top:.7rem;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.3);border-radius:5px;padding:.55rem .8rem;font-family:\"JetBrains Mono\",monospace;font-size:.68rem;color:#60a5fa;line-height:1.7;'>🌧 <b>Monsoon Season Active</b> — Flood and landslide risk elevated. Rispana, Bindal, and Song river catchments require continuous monitoring. NH-707 (Chakrata) prone to debris slides during sustained rainfall events.</div>",
  },
  9: {
    month: 9,
    season: "Retreating Monsoon",
    color: "#f06830",
    summary: "Retreating monsoon — residual flood risk. Inspect and repair road damage from peak months.",
    hazards: { Flood: "HIGH", Heat: "LOW", Wind: "LOW", Landslide: "MODERATE" },
    callout:
      "<div style='margin-top:.7rem;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.3);border-radius:5px;padding:.55rem .8rem;font-family:\"JetBrains Mono\",monospace;font-size:.68rem;color:#60a5fa;line-height:1.7;'>🌧 <b>Monsoon Season Active</b> — Flood and landslide risk elevated. Rispana, Bindal, and Song river catchments require continuous monitoring. NH-707 (Chakrata) prone to debris slides during sustained rainfall events.</div>",
  },
  10: {
    month: 10,
    season: "Post-Monsoon",
    color: "#f0a500",
    summary: "Post-monsoon — reduced hazards. Focus on infrastructure repair and slope stabilisation.",
    hazards: { Flood: "MODERATE", Heat: "LOW", Wind: "LOW", Landslide: "LOW" },
    callout: "",
  },
  11: {
    month: 11,
    season: "Early Winter",
    color: "#00c9a7",
    summary: "Winter onset — low hazard across all categories. Fog advisories for Jolly Grant Airport.",
    hazards: { Flood: "LOW", Heat: "LOW", Wind: "LOW", Landslide: "LOW" },
    callout: "",
  },
  12: {
    month: 12,
    season: "Winter",
    color: "#00c9a7",
    summary: "Winter — minimal risk. Snowfall possible at Chakrata and Mussoorie elevations above 1800m.",
    hazards: { Flood: "LOW", Heat: "LOW", Wind: "LOW", Landslide: "LOW" },
    callout: "",
  },
};

// Preventive actions per hazard and level (matching Python PREVENTIVE_ACTIONS)
const PREVENTIVE_ACTIONS: Record<string, Record<string, string[]>> = {
  Flood: {
    critical: [
      "Evacuate all residents from flood-prone zones — Prem Nagar, Niranjanpur, Doiwala, Raiwala",
      "Close all river crossings: Rispana (Patel Nagar), Bindal (Ladpur), Song (Doiwala)",
      "Activate Dehradun District EOC to Level 3; request NDRF deployment from Roorkee",
      "Issue emergency alert via NDMA App, SMS broadcast, and DD Uttarakhand",
      "Pre-position rescue boats at ISBT, Dehradun Railway Station, and Doiwala junction",
    ],
    high: [
      "Alert drainage & pumping crews for all low-lying wards",
      "Close Rispana bridge (Patel Nagar) if water level exceeds 1.5m gauge",
      "Deploy traffic police at flood-prone underpasses on Rajpur Road",
      "Open emergency shelters at Government Inter-Colleges in Raipur and Doiwala blocks",
      "Monitor Dakpathar and Premnagar Barrage discharge on hourly cycle",
    ],
    moderate: [
      "Issue advisory for low-lying residents near Rispana & Bindal river corridors",
      "Place sandbags at known flood entry points in Prem Nagar and Niranjanpur wards",
      "Alert municipal drainage teams — inspect and clear blocked drains before rain peak",
      "Coordinate with UPCL for transformer protection in flood-risk zones",
    ],
  },
  Heat: {
    critical: [
      "Declare Heat Emergency — open all government buildings as 24h cooling centres",
      "Issue mandatory work-from-home for non-essential outdoor workers in Raipur & Doiwala blocks",
      "Deploy mobile medical teams to Doiwala, Raiwala, Rishikesh, and Haridwar border zone",
      "Increase ambulance fleet standby at AIIMS Rishikesh by 50% during peak hours",
      "Distribute ORS packets via Anganwadi network in vulnerable urban and peri-urban blocks",
    ],
    high: [
      "Open cooling centres at Clock Tower, FRI Campus, Rajpur Road parks, and Selaqui",
      "Halt outdoor construction and road work 11:00–17:00 IST on all active sites",
      "Issue heat advisory via All India Radio Dehradun, local cable TV, and WhatsApp groups",
      "Activate early-dismissal protocol for schools in Doiwala and Raipur blocks",
      "Increase water tanker frequency in Paltan Bazaar, Dalanwala, and ISBT zone",
    ],
    moderate: [
      "Issue advisory for elderly and outdoor workers in Paltan Bazaar & Dalanwala",
      "Place drinking water kiosks at high-footfall locations: ISBT, Railway Station, FRI Gate",
      "Alert construction site supervisors to enforce mandatory shade breaks every 2 hours",
    ],
  },
  Wind: {
    critical: [
      "Ground all helicopter and small aircraft operations at Jolly Grant Airport immediately",
      "Evacuate temporary structures and scaffolding on Mussoorie Road and Kempty Road corridor",
      "Issue emergency advisory for Chakrata plateau and Mussoorie ridge settlements",
      "Pre-position UPCL rapid-response linemen crews at all ridge substations above 1500m",
      "Close Kempty Falls and Sahastradhara tourist areas until sustained winds drop below 40 km/h",
    ],
    high: [
      "Notify Jolly Grant ATC — gusts exceeding safe operational thresholds forecast",
      "Issue falling-tree advisory for Rajpur Road and FRI campus canopy corridor",
      "Secure loose billboards, hoardings, and construction material at Selaqui Industrial Area",
      "Alert UPCL linemen for Chakrata–Mussoorie transmission line patrol and pre-fault inspection",
      "Restrict vehicular movement on Mussoorie Road above Kimberley Point for heavy vehicles",
    ],
    moderate: [
      "Alert fire stations along Mussoorie Road ridge corridor for ember-spread risk",
      "Inspect and secure power line infrastructure at elevation above 1500m",
      "Issue caution advisory for two-wheelers and cyclists on exposed ridge roads",
    ],
  },
  Landslide: {
    critical: [
      "Immediately close NH-707 Kalsi–Chakrata stretch to all traffic; deploy police pickets",
      "Evacuate settlements within 200m of slopes >35° in Tyuni–Tons Valley and Benog Tibba",
      "Deploy SDRF teams to Sahastradhara, Maldevta, Barlowganj, and Benog Tibba zones",
      "Activate geo-monitoring alert level at all installed sensors in Mussoorie–Landour",
      "Issue press advisory: avoid Mussoorie Road, Kempty Road, Chakrata Road during rain",
    ],
    high: [
      "Inspect NH-707 Kalsi–Chakrata section; close if debris accumulation or cracking found",
      "Alert Sahastradhara zone residents and tourism operators — active historical slide location",
      "Pre-brief SDRF units at Chakrata and Vikasnagar block HQs for rapid 2-hour deployment",
      "Close Mussoorie Road Kimberley section if sustained rainfall exceeds 30mm/6h",
      "Deploy additional geo-monitoring sensors at Maldevta and Sahastradhara priority sites",
    ],
    moderate: [
      "Issue seasonal landslide advisory for Mussoorie–Landour and Chakrata tourist areas",
      "Request PWD inspection of retaining walls and culverts on Chakrata Road and NH-707",
      "Alert block development officers in Chakrata and Kalsi blocks for community-level inspection",
    ],
  },
};
function sortBySeverity(actions: ActionDecision[]): ActionDecision[] {
  return [...actions].sort((a, b) =>
    (SEVERITY_ORDER[a.locations[0]?.severity ?? "low"] ?? 2) -
    (SEVERITY_ORDER[b.locations[0]?.severity ?? "low"] ?? 2)
  );
}

function getLevel(val: number): string {
  if (val >= 0.75) return "CRITICAL";
  if (val >= 0.5) return "HIGH";
  if (val >= 0.25) return "MODERATE";
  return "LOW";
}

function getRiskColor(score: number): string {
  if (score >= 0.75) return "#e84040";
  if (score >= 0.5) return "#f06830";
  if (score >= 0.25) return "#f0a500";
  return "#00c9a7";
}

function buildRecommendations(
  forecast: ForecastPoint[],
  risk: Record<string, number>,
  riskCi: Record<string, [number, number]>,
  horizon: number
): Recommendation[] {
  const recs: Recommendation[] = [];

  // If no forecast data, return empty list
  if (!forecast || forecast.length === 0) return recs;

  // Normalize risk and riskCi to avoid undefined keys
  const safeRisk = {
    Flood: risk?.Flood ?? 0,
    Heat: risk?.Heat ?? 0,
    Wind: risk?.Wind ?? 0,
    Landslide: risk?.Landslide ?? 0,
  };
  const safeRiskCi = {
    Flood: riskCi?.Flood ?? [0, 0],
    Heat: riskCi?.Heat ?? [0, 0],
    Wind: riskCi?.Wind ?? [0, 0],
    Landslide: riskCi?.Landslide ?? [0, 0],
  };

  const times = forecast.map((p) => new Date(p.time));
  const now = new Date();

  const getPeakWindow = (values: number[]) => {
    const maxIdx = values.reduce((iMax, x, i, arr) => (x > arr[iMax] ? i : iMax), 0);
    const peak = values[maxIdx];
    const peakTime = times[maxIdx];
    const hours = Math.floor((peakTime.getTime() - now.getTime()) / 3600000);
    const when = hours > 2 ? `in ~${hours}h` : "within 2h";
    return { peak, when };
  };

  const rainPeak = getPeakWindow(forecast.map((p) => p.rain_adj));
  const tempPeak = getPeakWindow(forecast.map((p) => p.heat_index));
  const windPeak = getPeakWindow(forecast.map((p) => p.wind_kmph));
  const floodPeak = getPeakWindow(forecast.map((p) => p.flood_proxy));

  const rain24h = forecast.slice(0, 24).reduce((sum, p) => sum + p.rain_adj, 0);
  const tempHrsAbove35 = forecast.filter((p) => p.heat_index > 35).length;
  const tempHrsAbove40 = forecast.filter((p) => p.heat_index > 40).length;
  const windGustsAbove50 = forecast.filter((p) => p.wind_kmph > 50).length;
  let consecRain = 0;
  let cur = 0;
  for (const p of forecast) {
    if (p.rain_adj > 2.0) {
      cur++;
      consecRain = Math.max(consecRain, cur);
    } else {
      cur = 0;
    }
  }

  // Helper to safely get preventive actions
  const getPreventive = (hazard: string, level: string) => {
    return (PREVENTIVE_ACTIONS[hazard as keyof typeof PREVENTIVE_ACTIONS] as any)?.[level] || [];
  };

  // Flood
  if (safeRisk.Flood >= 0.25) {
    const level = safeRisk.Flood >= 0.75 ? "critical" : safeRisk.Flood >= 0.5 ? "high" : "moderate";
    recs.push({
      id: "FL-01",
      hazard: "Flood",
      level,
      title: "Activate Flood Early Warning Protocol",
      body: `Rainfall forecast peaks at <b>${rainPeak.peak.toFixed(1)} mm/hr</b> ${rainPeak.when}. Cumulative 24h: <b>${rain24h.toFixed(0)} mm</b>. Flood proxy: <b>${floodPeak.peak.toFixed(0)} mm</b>.`,
      actions: [
        "Alert drainage crews for Prem Nagar & Niranjanpur",
        `Monitor Rispana/Bindal levels every 2h (${rainPeak.when})`,
        "Pre-position rescue boats at ISBT and Railway Station",
      ],
      preventiveActions: getPreventive("Flood", level),
      forecastBasis: `Rain peak ${rainPeak.peak.toFixed(1)} mm/hr · 24h ${rain24h.toFixed(0)} mm · proxy ${floodPeak.peak.toFixed(0)} mm`,
      confidence: safeRiskCi.Flood,
    });
  }

  // Heat
  if (safeRisk.Heat >= 0.25) {
    const level = safeRisk.Heat >= 0.75 ? "critical" : safeRisk.Heat >= 0.5 ? "high" : "moderate";
    recs.push({
      id: "HT-01",
      hazard: "Heat",
      level,
      title: "Heat Health Advisory — Urban Core",
      body: `Heat index peaks at <b>${tempPeak.peak.toFixed(1)}°C</b> ${tempPeak.when}. <b>${tempHrsAbove35}h</b> above 35°C; <b>${tempHrsAbove40}h</b> above 40°C.`,
      actions: [
        `Open cooling centres at Clock Tower & FRI campus (${tempPeak.when})`,
        "Issue IMD heat wave advisory via Dehradun All India Radio",
        "Halt outdoor construction & road work 11:00–17:00 IST",
      ],
      preventiveActions: getPreventive("Heat", level),
      forecastBasis: `HI peak ${tempPeak.peak.toFixed(1)}°C · >35°C: ${tempHrsAbove35}h · >40°C: ${tempHrsAbove40}h`,
      confidence: safeRiskCi.Heat,
    });
  }

  // Wind
  if (safeRisk.Wind >= 0.25) {
    const level = safeRisk.Wind >= 0.75 ? "critical" : safeRisk.Wind >= 0.5 ? "high" : "moderate";
    recs.push({
      id: "WD-01",
      hazard: "Wind",
      level,
      title: "Ridge & Airport Wind Operations Advisory",
      body: `Wind peaks at <b>${windPeak.peak.toFixed(1)} km/h</b> ${windPeak.when}. <b>${windGustsAbove50}h</b> forecast above 50 km/h.`,
      actions: [
        `Notify Jolly Grant ATC: gusts ${windPeak.peak.toFixed(0)} km/h ${windPeak.when}`,
        "Secure infrastructure on Mussoorie Road corridor",
        "Issue falling-tree advisory for Rajpur Road",
      ],
      preventiveActions: getPreventive("Wind", level),
      forecastBasis: `Wind peak ${windPeak.peak.toFixed(1)} km/h · >50 km/h: ${windGustsAbove50}h`,
      confidence: safeRiskCi.Wind,
    });
  }

  // Landslide
  if (safeRisk.Landslide >= 0.25) {
    const level = safeRisk.Landslide >= 0.75 ? "critical" : safeRisk.Landslide >= 0.5 ? "high" : "moderate";
    recs.push({
      id: "LS-01",
      hazard: "Landslide",
      level,
      title: "Landslide-Prone Corridor Inspection",
      body: `Flood proxy <b>${floodPeak.peak.toFixed(0)} mm</b> and ${consecRain}h sustained rainfall saturate slopes. NH-707 and Mussoorie Road (Kimberley, slope >30°) priority.`,
      actions: [
        "Dispatch teams to NH-707 Kalsi–Chakrata stretch",
        "Close Mussoorie Road Kimberley if rain >30mm/6h",
        "Alert Sahastradhara zone residents",
      ],
      preventiveActions: getPreventive("Landslide", level),
      forecastBasis: `Proxy ${floodPeak.peak.toFixed(0)} mm · consec rain ${consecRain}h · LS ${(safeRisk.Landslide * 100).toFixed(0)}%`,
      confidence: safeRiskCi.Landslide,
    });
  }

  // Multi-hazard if 3+ active
  const activeHazards = Object.entries(safeRisk)
    .filter(([_, score]) => score >= 0.25)
    .map(([h]) => h);
  if (activeHazards.length >= 3) {
    recs.push({
      id: "MH-01",
      hazard: "Multi-Hazard",
      level: "high",
      title: "Compound Event — Coordinated EOC Activation",
      body: `<b>${activeHazards.length} simultaneous hazards</b> above threshold: ${activeHazards.join(", ")}.`,
      actions: [
        "Activate Dehradun District EOC to Level 2",
        "Coordinate SDRF across Chakrata, Doiwala, and Rishikesh tehsils",
        "Issue unified advisory via NDMA App & DD News",
      ],
      preventiveActions: [],
      forecastBasis: `Active: ${activeHazards.join(", ")} · horizon: ${horizon}h`,
      confidence: [0.45, 0.75],
    });
  }

  // Sort by severity
  const levelOrder: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
  recs.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  return recs;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("RECOMMENDATIONS");
  const [actions, setActions] = useState<ActionDecision[]>([]);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [hazard, setHazard] = useState<HazardType>("ALL");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const [forecastHours, setForecastHours] = useState(72);
  const [rainThreshold, setRainThreshold] = useState(80);
  const [heatThreshold, setHeatThreshold] = useState(35);
  const [windThreshold, setWindThreshold] = useState(40);

  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  const [metrics, setMetrics] = useState<any>(null);
  const [blockRisk, setBlockRisk] = useState<Record<string, any>>({});
  const [forecastData, setForecastData] = useState<ForecastPoint[]>([]);
  const [riskEvolution, setRiskEvolution] = useState<RiskEvolution>({
    time: [], flood: [], heat: [], wind: [], landslide: [],
  });
  const [evaluationResults, setEvaluationResults] = useState<EvaluationResult[]>([]);
  const [agentTrace, setAgentTrace] = useState<AgentStep[]>([]);
  const [seasonalContext, setSeasonalContext] = useState<SeasonalContext>(SEASONAL_RISKS[new Date().getMonth() + 1]);
  const [riskScores, setRiskScores] = useState<Record<string, number>>({ Flood: 0, Heat: 0, Wind: 0, Landslide: 0 });
  const [riskCIs, setRiskCIs] = useState<Record<string, [number, number]>>({
    Flood: [0, 0], Heat: [0, 0], Wind: [0, 0], Landslide: [0, 0],
  });

  const loadAllData = async () => {
    try {
      const [metricsRes, decisionsRes, blockRiskRes, forecastRes, riskEvolRes, traceRes] = await Promise.all([
        fetchMetrics(),
        fetchDecisions({ forecast_hours: forecastHours, rain_thresh: rainThreshold, temp_thresh: heatThreshold, wind_thresh: windThreshold }),
        axios.get(`${API_BASE}/api/block_risk`),
        axios.get(`${API_BASE}/api/forecast`),
        axios.get(`${API_BASE}/api/risk_evolution`),
        axios.get(`${API_BASE}/api/agent_trace`),
      ]);

      setMetrics(metricsRes);
      setActions(decisionsRes.actions || []);
      setBlockRisk(blockRiskRes.data);
      setForecastData(forecastRes.data?.forecast || forecastRes.data || []);

      // Handle risk evolution response (array of objects)
      const evolData = riskEvolRes.data;
      if (Array.isArray(evolData) && evolData.length > 0) {
        setRiskEvolution({
          time: evolData.map((p: any) => p.time),
          flood: evolData.map((p: any) => p.flood),
          heat: evolData.map((p: any) => p.heat),
          wind: evolData.map((p: any) => p.wind),
          landslide: evolData.map((p: any) => p.landslide),
        });
      } else {
        setRiskEvolution({ time: [], flood: [], heat: [], wind: [], landslide: [] });
      }
      setAgentTrace(traceRes.data.steps || []);

      if (decisionsRes.risk) setRiskScores(decisionsRes.risk);
      if (decisionsRes.risk_ci) setRiskCIs(decisionsRes.risk_ci);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 30000);
    return () => clearInterval(interval);
  }, [forecastHours, rainThreshold, heatThreshold, windThreshold]);

  useEffect(() => {
    const month = new Date().getMonth() + 1;
    setSeasonalContext(SEASONAL_RISKS[month] || SEASONAL_RISKS[3]);
  }, []);

  const runEvaluation = async () => {
    setEvaluating(true);
    try {
      const res = await axios.post(`${API_BASE}/api/run_evaluation`);
      setEvaluationResults(res.data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setEvaluating(false);
    }
  };

  const filteredActions = hazard === "ALL" ? actions : actions.filter((a) => a.hazard?.toUpperCase() === hazard);
  const severityFiltered = severityFilter === "all" ? filteredActions : filteredActions.filter((a) => a.locations[0]?.severity === severityFilter);
  const sortedActions = sortBySeverity(severityFiltered).slice(0, 40);
  const highActions = sortBySeverity(filteredActions).filter((a) => a.locations[0]?.severity === "high").slice(0, 15);
  const mediumActions = sortBySeverity(filteredActions).filter((a) => a.locations[0]?.severity === "medium").slice(0, 15);
  const lowActions = sortBySeverity(filteredActions).filter((a) => a.locations[0]?.severity === "low").slice(0, 10);

  const blockRiskData = Object.keys(blockRisk || {}).map((name) => ({
    name,
    flood: getLevel(blockRisk[name]?.flood || 0),
    heat: getLevel(blockRisk[name]?.heat || 0),
    wind: getLevel(blockRisk[name]?.wind || 0),
    landslide: getLevel(blockRisk[name]?.landslide || 0),
  }));

  const recommendations = forecastData.length > 0 ? buildRecommendations(forecastData, riskScores, riskCIs, forecastHours) : [];

  const computePeak = (values: number[]) => {
    if (!values || values.length === 0) return { peak: 0 };
    return { peak: Math.max(...values) };
  };
  const rainPeak = computePeak(forecastData.map(p => p.rain_adj));
  const tempPeak = computePeak(forecastData.map(p => p.heat_index));
  const windPeak = computePeak(forecastData.map(p => p.wind_kmph));
  const floodPeak = computePeak(forecastData.map(p => p.flood_proxy));

  const timeseriesLabels = forecastData.map((p) => new Date(p.time).toLocaleString());
  const timeseriesData = {
    labels: timeseriesLabels,
    datasets: [
      { label: "Rain (mm/hr)", data: forecastData.map((p) => p.rain_adj), borderColor: "#00c9a7", backgroundColor: "rgba(0,201,167,0.1)", fill: true, tension: 0.4, yAxisID: "y-rain" },
      { label: "Temp (°C)", data: forecastData.map((p) => p.temp_c), borderColor: "#f0a500", backgroundColor: "transparent", borderDash: [5, 5], tension: 0.4, yAxisID: "y-temp" },
      { label: "Wind (km/h)", data: forecastData.map((p) => p.wind_kmph), borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,0.1)", fill: true, tension: 0.4, yAxisID: "y-wind" },
    ],
  };

  const riskEvolutionData = {
    labels: (riskEvolution?.time || []).map((t) => new Date(t).toLocaleString()),
    datasets: [
      { label: "Flood Risk", data: riskEvolution.flood, borderColor: "#00c9a7", backgroundColor: "rgba(0,201,167,0.1)", fill: true, tension: 0.4 },
      { label: "Heat Risk", data: riskEvolution.heat, borderColor: "#e84040", backgroundColor: "rgba(232,64,64,0.1)", fill: true, tension: 0.4 },
      { label: "Wind Risk", data: riskEvolution.wind, borderColor: "#f0a500", backgroundColor: "rgba(240,165,0,0.1)", fill: true, tension: 0.4 },
      { label: "Landslide Risk", data: riskEvolution.landslide, borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,0.1)", fill: true, tension: 0.4 },
    ],
  };

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-black text-white">Loading dashboard...</div>;
  }

  return (
    <div className="h-screen bg-black text-white overflow-y-auto flex flex-col font-sans">
      <div className="px-6 py-4 text-xl font-semibold">WeatherOps GeoAI Dashboard</div>

      {/* Metrics Row */}
      <div className="px-6 grid grid-cols-5 gap-4">
        <MetricCard title="RAIN PEAK" value={rainPeak.peak.toFixed(1)} unit="mm/hr" />
        <MetricCard title="TEMP PEAK" value={metrics?.temp_peak?.toFixed(1) ?? "28.2"} unit="°C" />
        <MetricCard title="WIND PEAK" value={metrics?.wind_peak?.toFixed(1) ?? "22.0"} unit="km/h" />
        <MetricCard title="FLOOD RISK" value={((riskScores.Flood || 0) * 100).toFixed(1)} unit="%" />
        <MetricCard title="HIGH RISK ZONES" value={metrics?.high_zones ?? "0"} unit="zones" />
      </div>
      <div className="px-6 pb-4 grid grid-cols-2 gap-4">
        <MetricCard title="MEDIUM RISK ZONES" value={metrics?.medium_zones ?? "0"} unit="zones" />
        <MetricCard title="LOW RISK ZONES" value={metrics?.low_zones ?? "0"} unit="zones" />
      </div>

      {/* Hazard Score Bars */}
      <div className="px-6 pb-6 grid grid-cols-4 gap-4">
        {Object.entries(riskScores).map(([hazard, score]) => (
          <div key={hazard} className="bg-[#181b22] border border-[#3a4155] rounded-2xl p-5">
            <div className="flex justify-between text-xs mb-2">
              <span>{hazard === "Flood" && "🌊"} {hazard === "Heat" && "🔥"} {hazard === "Wind" && "💨"} {hazard === "Landslide" && "⛰️"} {hazard}</span>
              <span style={{ color: getRiskColor(score) }}>{(score * 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-zinc-700 rounded-full relative">
              <div className="absolute h-2 rounded-full" style={{ width: `${score * 100}%`, backgroundColor: getRiskColor(score) }} />
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">CI: {(riskCIs[hazard]?.[0] * 100).toFixed(0)}–{(riskCIs[hazard]?.[1] * 100).toFixed(0)}%</div>
          </div>
        ))}
      </div>

      {/* Forecast Horizon + Risk Thresholds */}
      <div className="px-6 pt-2 pb-6 space-y-6">
        <div className="bg-[#181b22] border border-[#3a4155] rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-zinc-400 mb-2">FORECAST HORIZON</div>
          <div className="flex justify-between text-3xl font-bold mb-4">
            <span>{forecastHours}</span>
            <span className="text-amber-400">HOURS</span>
          </div>
          <input type="range" min={24} max={120} step={6} value={forecastHours} onChange={(e) => setForecastHours(Number(e.target.value))} className="w-full h-1 bg-amber-400 rounded-lg appearance-none cursor-pointer" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#181b22] border border-[#3a4155] rounded-2xl p-6">
            <div className="text-xs text-zinc-400 mb-1">RAIN (MM/HR)</div>
            <div className="text-5xl font-bold text-amber-400 mb-2">{rainThreshold}</div>
            <input type="range" min={20} max={150} value={rainThreshold} onChange={(e) => setRainThreshold(Number(e.target.value))} className="w-full h-1 bg-amber-400 rounded-lg appearance-none cursor-pointer mt-4" />
          </div>
          <div className="bg-[#181b22] border border-[#3a4155] rounded-2xl p-6">
            <div className="text-xs text-zinc-400 mb-1">HEAT (°C)</div>
            <div className="text-5xl font-bold text-orange-400 mb-2">{heatThreshold}</div>
            <input type="range" min={25} max={50} value={heatThreshold} onChange={(e) => setHeatThreshold(Number(e.target.value))} className="w-full h-1 bg-orange-400 rounded-lg appearance-none cursor-pointer mt-4" />
          </div>
          <div className="bg-[#181b22] border border-[#3a4155] rounded-2xl p-6">
            <div className="text-xs text-zinc-400 mb-1">WIND (KM/H)</div>
            <div className="text-5xl font-bold text-purple-400 mb-2">{windThreshold}</div>
            <input type="range" min={10} max={100} value={windThreshold} onChange={(e) => setWindThreshold(Number(e.target.value))} className="w-full h-1 bg-purple-400 rounded-lg appearance-none cursor-pointer mt-4" />
          </div>
        </div>
      </div>

      {/* Map + Action Cards */}
      <main className="flex-1 px-6 grid grid-cols-12 gap-6 min-h-0 pb-6">
        {/* Map Section */}
        <section className="col-span-8 bg-zinc-900 rounded-3xl flex flex-col overflow-hidden min-h-0">
          <div className="flex gap-2 p-4 border-b border-[#2a2f3d]">
            {(["ALL", "FLOOD", "HEAT", "WIND", "LANDSLIDE"] as HazardType[]).map((h) => (
              <button key={h} onClick={() => setHazard(h)} className={`px-6 py-2 rounded-full text-sm border transition-all ${hazard === h ? "bg-blue-600 border-blue-600 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>{h}</button>
            ))}
          </div>
          <div className="flex gap-2 p-3 border-b border-[#2a2f3d]">
            {(["all", "high", "medium", "low"] as SeverityFilter[]).map((s) => (
              <button key={s} onClick={() => setSeverityFilter(s)} className={`px-4 py-1 text-xs rounded-full border transition-all ${severityFilter === s ? "bg-white text-black" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>{s.toUpperCase()}</button>
            ))}
          </div>
          <div className="flex-1 relative min-h-0">
            <ImpactMap actions={filteredActions} selectedActionId={selectedActionId} onSelectAction={setSelectedActionId} hazard={hazard} severityFilter={severityFilter} />
          </div>
        </section>

        {/* Action Cards Panel */}
        <section className="col-span-4 bg-zinc-900 rounded-3xl p-6 flex flex-col min-h-0">
          <h2 className="text-lg font-semibold mb-4">Action Cards</h2>
          <div className="flex gap-2 mb-4">
            <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">🔴 {highActions.length} High</span>
            <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs">🟠 {mediumActions.length} Medium</span>
            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">🟡 {lowActions.length} Low</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3">
            {sortedActions.map((action) => (
              <ActionCard key={action.id} action={action} selected={selectedActionId === action.id} onClick={() => setSelectedActionId(action.id)} />
            ))}
          </div>
        </section>
      </main>

      {/* Tabs */}
      <div className="px-6 pb-6">
        <div className="flex border-b border-[#2a2f3d] mb-6">
          {(["RECOMMENDATIONS", "FORECAST TIMESERIES", "RAW DATA", "EVALUATION AGENT", "AGENT TRACE"] as Tab[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium transition-all ${activeTab === tab ? "text-amber-400 border-b-2 border-amber-400" : "text-zinc-400 hover:text-white"}`}>{tab}</button>
          ))}
        </div>

        {/* Tab content (s as before, but ensure it's scrollable) */}
        {activeTab === "RECOMMENDATIONS" && (
          <div className="space-y-6">
            {/* Seasonal Risk Context */}
            <div className="bg-[#181b22] border rounded-2xl p-6" style={{ borderColor: `${seasonalContext.color}40` }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold" style={{ color: seasonalContext.color }}>🗓 Seasonal Risk Context · {new Date().toLocaleString("default", { month: "long" })}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{seasonalContext.season}</p>
                </div>
                <span className="text-xs font-mono px-3 py-1 rounded-full" style={{ backgroundColor: `${seasonalContext.color}20`, color: seasonalContext.color }}>{seasonalContext.season}</span>
              </div>
              <div className="flex gap-3 mb-4 flex-wrap">
                {Object.entries(seasonalContext.hazards).map(([haz, lvl]) => (
                  <span key={haz} className="text-xs font-mono px-3 py-1 rounded-full" style={{ backgroundColor: `${lvl === "CRITICAL" ? "#e84040" : lvl === "HIGH" ? "#f06830" : lvl === "MODERATE" ? "#f0a500" : "#00c9a7"}20`, color: lvl === "CRITICAL" ? "#e84040" : lvl === "HIGH" ? "#f06830" : lvl === "MODERATE" ? "#f0a500" : "#00c9a7" }}>
                    {haz === "Flood" && "🌊"} {haz === "Heat" && "🔥"} {haz === "Wind" && "💨"} {haz === "Landslide" && "⛰️"} {haz}: {lvl}
                  </span>
                ))}
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed">{seasonalContext.summary}</p>
              {seasonalContext.callout && <div className="mt-4 p-3 rounded-lg text-sm" dangerouslySetInnerHTML={{ __html: seasonalContext.callout }} />}
            </div>

            {/* Active Recommendations Summary */}
            <div className="bg-[#111318] border border-amber-600 rounded-xl p-5 flex justify-between items-center">
              <div>
                <div className="text-lg font-bold text-amber-400">{recommendations.length} Active Recommendation{recommendations.length !== 1 ? "s" : ""} · Next {forecastHours}h</div>
                <div className="text-xs text-zinc-500 mt-1">Derived from Open-Meteo forecast · terrain-blended · hazard-threshold analysis</div>
              </div>
              <div className="flex gap-2">
                {recommendations.filter((r) => r.level === "critical").length > 0 && <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">{recommendations.filter((r) => r.level === "critical").length} CRITICAL</span>}
                {recommendations.filter((r) => r.level === "high").length > 0 && <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs">{recommendations.filter((r) => r.level === "high").length} HIGH</span>}
                {recommendations.filter((r) => r.level === "moderate").length > 0 && <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs">{recommendations.filter((r) => r.level === "moderate").length} MODERATE</span>}
              </div>
            </div>

            {/* Forecast Snapshot */}
            <div className="grid grid-cols-5 gap-4">
              <MetricCard title="🌧 Rain Peak" value={rainPeak?.peak.toFixed(1) ?? "0.0"} unit="mm/hr" />
              <MetricCard title="🌡 Heat Index" value={tempPeak?.peak.toFixed(1) ?? "0.0"} unit="°C" />
              <MetricCard title="💨 Wind Peak" value={windPeak?.peak.toFixed(1) ?? "0.0"} unit="km/h" />
              <MetricCard title="🌊 Flood Proxy" value={floodPeak?.peak.toFixed(0) ?? "0"} unit="mm/6h" />
              <MetricCard title="⏱ Horizon" value={forecastHours.toString()} unit="hours" />
            </div>

            {/* Risk Evolution Chart */}
            <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-4">
              <h4 className="text-sm font-mono text-zinc-400 mb-3">Risk Evolution — Forecast Window</h4>
              <Line data={riskEvolutionData} options={{
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                  y: { min: 0, max: 1, grid: { color: "#2a2f3d" }, ticks: { callback: (val) => { if (val === 0) return "LOW"; if (val === 0.25) return "MOD"; if (val === 0.5) return "HIGH"; if (val === 0.75) return "CRIT"; return ""; }, color: "#8a93a8" } },
                  x: { ticks: { color: "#8a93a8", maxRotation: 45, autoSkip: true, maxTicksLimit: 8 }, grid: { color: "#2a2f3d" } }
                },
                plugins: { legend: { labels: { color: "#8a93a8" } }, tooltip: { mode: "index", intersect: false } }
              }} />
            </div>

            {/* Detailed Recommendation Cards */}
            {recommendations.length === 0 ? (
              <div className="bg-[#111318] border border-teal-500 rounded-xl p-6 text-center">
                <div className="text-teal-400 font-bold text-lg">✓ All Clear</div>
                <div className="text-zinc-400 text-sm">All hazard scores below action threshold. Continue routine monitoring.</div>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(recommendations.reduce((acc, rec) => { if (!acc[rec.hazard]) acc[rec.hazard] = []; acc[rec.hazard].push(rec); return acc; }, {} as Record<string, Recommendation[]>)).map(([hazard, recs]) => (
                  <div key={hazard}>
                    <h3 className="text-md font-mono text-zinc-400 border-b border-zinc-800 pb-2 mb-3">{hazard === "Flood" && "🌊"} {hazard === "Heat" && "🔥"} {hazard === "Wind" && "💨"} {hazard === "Landslide" && "⛰️"} {hazard === "Multi-Hazard" && "⚡"} {hazard} Recommendations</h3>
                    {recs.map((rec) => (
                      <div key={rec.id} className="bg-[#111318] border-l-4 rounded-xl p-5 mb-4" style={{ borderLeftColor: getRiskColor(riskScores[rec.hazard] || 0) }}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="text-xs text-zinc-500 font-mono">ID: {rec.id}</div>
                            <div className="text-lg font-bold text-white">{rec.title}</div>
                          </div>
                          <span className="text-xs font-mono px-3 py-1 rounded-full" style={{ backgroundColor: `${rec.level === "critical" ? "#e84040" : rec.level === "high" ? "#f06830" : "#f0a500"}20`, color: rec.level === "critical" ? "#e84040" : rec.level === "high" ? "#f06830" : "#f0a500" }}>{rec.level.toUpperCase()}</span>
                        </div>
                        <div className="text-sm text-zinc-300 mb-3" dangerouslySetInnerHTML={{ __html: rec.body }} />
                        <div className="space-y-1 mb-3">
                          {rec.actions.map((action, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm text-zinc-300"><span className="text-amber-400">▸</span><span>{action}</span></div>
                          ))}
                        </div>
                        {rec.preventiveActions.length > 0 && (
                          <div className="bg-black/30 rounded-lg p-3 mb-3 border-l-2 border-zinc-600">
                            <div className="text-xs font-mono text-zinc-500 mb-2">🛡 Preventive Actions</div>
                            {rec.preventiveActions.map((act, idx) => (
                              <div key={idx} className="text-xs text-zinc-400 flex gap-2"><span>▷</span><span>{act}</span></div>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-zinc-500 font-mono mb-2">FORECAST BASIS: {rec.forecastBasis}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-zinc-500">Confidence</span>
                          <div className="flex-1 h-1 bg-zinc-800 rounded-full relative">
                            <div className="absolute h-1 rounded-full" style={{ left: `${rec.confidence[0] * 100}%`, width: `${(rec.confidence[1] - rec.confidence[0]) * 100}%`, backgroundColor: getRiskColor(riskScores[rec.hazard] || 0), opacity: 0.7 }} />
                          </div>
                          <span className="text-xs text-zinc-500 font-mono">{rec.confidence[0].toFixed(2)}–{rec.confidence[1].toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "FORECAST TIMESERIES" && (
          <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-4">
            <Line data={timeseriesData} options={{
              responsive: true,
              maintainAspectRatio: true,
              scales: {
                "y-rain": { type: "linear", position: "left", title: { display: true, text: "Rain (mm/hr)", color: "#00c9a7" }, grid: { color: "#2a2f3d" }, ticks: { color: "#8a93a8" } },
                "y-temp": { type: "linear", position: "right", title: { display: true, text: "Temp (°C)", color: "#f0a500" }, grid: { drawOnChartArea: false }, ticks: { color: "#8a93a8" } },
                "y-wind": { type: "linear", position: "right", title: { display: true, text: "Wind (km/h)", color: "#a78bfa" }, grid: { drawOnChartArea: false }, ticks: { color: "#8a93a8" } },
                x: { ticks: { color: "#8a93a8", maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { color: "#2a2f3d" } }
              },
              plugins: { legend: { labels: { color: "#8a93a8" } }, tooltip: { mode: "index", intersect: false } }
            }} />
          </div>
        )}

        {activeTab === "RAW DATA" && (
          <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#1e2230] text-zinc-300 text-xs font-mono">
                <tr><th className="px-4 py-2">Time</th><th className="px-4 py-2">Rain Raw (mm)</th><th className="px-4 py-2">Rain Adj (mm)</th><th className="px-4 py-2">Temp (°C)</th><th className="px-4 py-2">Heat Index (°C)</th><th className="px-4 py-2">Wind (km/h)</th><th className="px-4 py-2">Flood Proxy</th></tr>
              </thead>
              <tbody>
                {forecastData.slice(0, 48).map((row, idx) => (
                  <tr key={idx} className="border-t border-[#2a2f3d]">
                    <td className="px-4 py-2 font-mono text-xs">{new Date(row.time).toLocaleString()}</td>
                    <td className="px-4 py-2">{row.rain_mm.toFixed(1)}</td>
                    <td className="px-4 py-2">{row.rain_adj.toFixed(1)}</td>
                    <td className="px-4 py-2">{row.temp_c.toFixed(1)}</td>
                    <td className="px-4 py-2">{row.heat_index.toFixed(1)}</td>
                    <td className="px-4 py-2">{row.wind_kmph.toFixed(1)}</td>
                    <td className="px-4 py-2">{row.flood_proxy.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "EVALUATION AGENT" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-mono text-amber-400">Agent 05 · Statistical Model Evaluation</h3>
              <button onClick={runEvaluation} disabled={evaluating} className="bg-amber-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition">{evaluating ? "Training..." : "▶ Run Evaluation"}</button>
            </div>
            {evaluationResults.length === 0 ? (
              <div className="bg-[#111318] border border-zinc-800 rounded-xl p-8 text-center text-zinc-400">Click "Run Evaluation" to train models and view metrics.</div>
            ) : (
              <div className="space-y-8">
                {evaluationResults.map((res) => (
                  <div key={res.hazard} className="bg-[#111318] border border-zinc-800 rounded-xl p-5">
                    <h4 className="text-lg font-bold text-amber-400 mb-2">{res.display}</h4>
                    <div className="grid grid-cols-4 gap-4 mb-4 text-xs"><div>Train: {res.n_train}</div><div>Test: {res.n_test}</div><div>Features: {res.features.length}</div>{res.task === "clf" && <div>Pos Rate: N/A</div>}{res.task === "reg" && <div>Baseline RMSE: N/A</div>}</div>
                    <div className="space-y-2">
                      <div className="text-sm font-mono text-zinc-400 mb-2">Model Comparison</div>
                      {Object.entries(res.models).map(([name, metrics]) => (
                        <div key={name} className="flex flex-wrap gap-3 text-xs bg-black/30 p-2 rounded"><span className="font-bold">{name === res.best_model && "★"} {name}</span>{res.task === "clf" ? (<> <span>AUC: {metrics.roc_auc?.toFixed(3)}</span> <span>F1: {metrics.f1?.toFixed(3)}</span> <span>Brier: {metrics.brier?.toFixed(3)}</span> <span>CV-AUC: {metrics.cv_auc_mean?.toFixed(3)}</span> </>) : (<> <span>R²: {metrics.r2?.toFixed(3)}</span> <span>RMSE: {metrics.rmse?.toFixed(2)}</span> <span>CV-R²: {metrics.cv_r2_mean?.toFixed(3)}</span> </>)}</div>
                      ))}
                    </div>
                    {res.roc_data && <div className="mt-4"><div className="text-sm font-mono text-zinc-400">ROC Curve</div></div>}
                  </div>
                ))}
                <div className="bg-[#111318] border border-zinc-800 rounded-xl p-5">
                  <h4 className="text-lg font-mono text-amber-400 mb-3">🏆 Model Leaderboard</h4>
                  <div className="space-y-2">
                    {evaluationResults.map((res) => (
                      <div key={res.hazard} className="flex items-center gap-3 text-sm">
                        <div className="w-32">{res.display}</div>
                        <div className="w-32 font-bold">{res.best_model}</div>
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full"><div className="h-1 rounded-full" style={{ width: `${(res.models[res.best_model]?.roc_auc || res.models[res.best_model]?.r2 || 0) * 100}%`, backgroundColor: res.task === "clf" ? "#f0a500" : "#00c9a7" }} /></div>
                        <div className="w-20 text-right">{res.task === "clf" ? `AUC=${(res.models[res.best_model]?.roc_auc || 0).toFixed(3)}` : `R²=${(res.models[res.best_model]?.r2 || 0).toFixed(3)}`}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "AGENT TRACE" && (
          <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-5">
            <h4 className="text-sm font-mono text-zinc-400 mb-4">Pipeline Execution Log</h4>
            <div className="space-y-3">
              {agentTrace.length === 0 ? <div className="text-zinc-500 text-sm">No trace data available.</div> : agentTrace.map((step) => (
                <div key={step.idx} className="flex items-start gap-3 text-sm">
                  <span className="text-amber-400 w-8">{step.idx}</span>
                  <span className={step.status === "ok" ? "text-teal-400" : step.status === "warn" ? "text-amber-400" : "text-red-400"}>{step.status === "ok" ? "✓" : step.status === "warn" ? "⚡" : "✗"}</span>
                  <span className="font-mono">{step.agent}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400">{step.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 pb-8">
        <BlockRiskGrid data={blockRiskData} />
      </div>
    </div>
  );
}