import { useEffect, useState } from "react";
import axios from "axios";

import ImpactMap from "../components/map/ImpactMap";
import ActionCard from "../components/cards/ActionCard";
import { fetchDecisions, downloadReport, fetchMetrics } from "../services/api";
import type { ActionDecision } from "../types/impact";
import MetricCard from "../components/cards/MetricCard";

type HazardType = "ALL" | "FLOOD" | "HEAT" | "WIND" | "LANDSLIDE";
type SeverityFilter = "all" | "high" | "medium" | "low";

const API_BASE = "https://weatherops-production.up.railway.app";

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortBySeverity(actions: ActionDecision[]): ActionDecision[] {
  return [...actions].sort((a, b) => {
    const sA = a.locations[0]?.severity ?? "low";
    const sB = b.locations[0]?.severity ?? "low";
    return SEVERITY_ORDER[sA] - SEVERITY_ORDER[sB];
  });
}

function HazardScoreBar({
  label,
  score,
  ci,
  color,
}: {
  label: string;
  score: number;
  ci: [number, number];
  color: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-zinc-400 uppercase tracking-wide font-medium">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>{score.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-zinc-700 rounded-full relative overflow-hidden">
        <div
          className="absolute top-0 bottom-0 rounded-full opacity-80"
          style={{ left: `${ci[0]}%`, width: `${ci[1] - ci[0]}%`, background: color }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 rounded-full"
          style={{ left: `${score}%`, background: color }}
        />
      </div>
      <div className="text-zinc-600 text-xs mt-1">CI: {ci[0]}–{ci[1]}%</div>
    </div>
  );
}

export default function Dashboard() {
  const [actions, setActions]                   = useState<ActionDecision[]>([]);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [hazard, setHazard]                     = useState<HazardType>("ALL");
  const [severityFilter, setSeverityFilter]     = useState<SeverityFilter>("all");
  const [loading, setLoading]                   = useState(true);
  const [downloading, setDownloading]           = useState(false);
  const [backendStatus, setBackendStatus]       = useState<"online" | "offline">("offline");
  const [metrics, setMetrics]                   = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("--");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDecisions = async () => {
    try {
      const data = await fetchDecisions();
      setActions(data.actions || []);
      setBackendStatus("online");
    } catch (error) {
      console.error("Failed to fetch decisions:", error);
      setBackendStatus("offline");
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const m = await fetchMetrics();
      setMetrics(m);
    } catch (err) {
      console.error("Metrics load failed:", err);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setIsRefreshing(true); 
      await Promise.all([
        loadMetrics(),
        loadDecisions(),
        loadLastUpdated()
        ]);
        setIsRefreshing(false);
        };
        loadAll();
        const interval = setInterval(loadAll, 30000);
        return () => clearInterval(interval);
        }, []);
  
  const loadLastUpdated = async () => {
  try {
    const res = await axios.get(`${API_BASE}/api/last_updated`);
    setLastUpdated(res.data.last_updated);
  } catch (err) {
    console.error("Failed to fetch last updated:", err);
  }
};

  // ── Filter by hazard type ─────────────────────────────────────
  const filteredActions =
    hazard === "ALL"
      ? actions
      : actions.filter((a) => a.hazard?.toUpperCase() === hazard);

  // ── Further filter by severity for action cards ───────────────
  const severityFiltered =
    severityFilter === "all"
      ? filteredActions
      : filteredActions.filter(
          (a) => a.locations[0]?.severity === severityFilter
        );

  const sorted        = sortBySeverity(severityFiltered);
  const highActions   = sortBySeverity(filteredActions).filter((a) => a.locations[0]?.severity === "high").slice(0, 15);
  const mediumActions = sortBySeverity(filteredActions).filter((a) => a.locations[0]?.severity === "medium").slice(0, 15);
  const lowActions    = sortBySeverity(filteredActions).filter((a) => a.locations[0]?.severity === "low").slice(0, 10);
  const sortedActions = sorted.slice(0, 40);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await downloadReport();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "WeatherOps_Report.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  const formatTime = (timeStr: string) => {

   if (!timeStr || timeStr === "Not available") return "--";
   const date = new Date(timeStr);
   if (isNaN(date.getTime())) return "--";
   return date.toLocaleTimeString();
 };

  const hazardScores = metrics?.hazard_scores ?? null;
  const hazardCI     = metrics?.hazard_ci     ?? null;

  return (
    <div className="h-screen bg-black text-white overflow-hidden flex flex-col">

      {/* ── Top status bar ── */}
      <div className="flex justify-between items-center px-6 py-2 bg-zinc-900 border-b border-zinc-800 text-sm shrink-0">
        <div className="font-semibold tracking-wide">WeatherOps GeoAI Dashboard</div>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>Now: {new Date().toLocaleTimeString()}</span>
          {isRefreshing ? (
            <span className="flex items-center gap-1 text-yellow-400">
              <span className="animate-spin">🔄</span>
              Refreshing...
              </span>
            ) : (
              <span className="text-zinc-400">
                Last Updated: {formatTime(lastUpdated)}
              </span>
              )}

          {backendStatus === "online" ? (
            <span className="text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Backend Connected
            </span>
          ) : (
            <span className="text-red-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-400 rounded-full" />
              Backend Offline
            </span>
          )}
        </div>
      </div>

      {/* ── Weather metric cards ── */}
      {metrics && (
        <div className="grid grid-cols-5 gap-3 px-6 py-3 shrink-0">
          <MetricCard title="Rain Peak"         value={metrics.rain_peak?.toFixed(1) ?? "0.0"}                          unit="mm/hr" />
          <MetricCard title="Temp Peak"         value={metrics.temp_peak?.toFixed(1) ?? "--"}                           unit="°C"    />
          <MetricCard title="Wind Peak"         value={metrics.wind_peak?.toFixed(1) ?? "--"}                           unit="km/h"  />
          <MetricCard title="Flood Risk (ML)"   value={metrics.flood_risk != null ? String(metrics.flood_risk) : "N/A"} unit="%"     />
          <MetricCard title="High Risk Zones"   value={metrics.high_zones ?? 0}                                         unit="zones" />
          <MetricCard title="Medium Risk Zones" value={metrics.medium_zones ?? 0}                                       unit="zones" />
          <MetricCard title="Low Risk Zones"    value={metrics.low_zones ?? 0}                                          unit="zones" />
        </div>
      )}

      {/* ── 4-Hazard score bars ── */}
      {hazardScores && hazardCI && (
        <div className="grid grid-cols-4 gap-3 px-6 pb-3 shrink-0">
          <HazardScoreBar label="🌊 Flood"     score={hazardScores.flood}     ci={hazardCI.flood}     color="#60a5fa" />
          <HazardScoreBar label="🔥 Heat"      score={hazardScores.heat}      ci={hazardCI.heat}      color="#f97316" />
          <HazardScoreBar label="💨 Wind"      score={hazardScores.wind}      ci={hazardCI.wind}      color="#a78bfa" />
          <HazardScoreBar label="⛰ Landslide" score={hazardScores.landslide} ci={hazardCI.landslide} color="#f0a500" />
        </div>
      )}

      {/* ── Main content: map + action cards ── */}
      <main className="flex-1 px-6 pb-6 grid grid-cols-12 gap-6 min-h-0">

        {/* ── Map ── */}
        <section className="col-span-8 bg-zinc-900 rounded-xl flex flex-col min-h-0">

          {/* Hazard tabs + severity filter in one bar */}
          <div className="flex items-center justify-between gap-2 p-3 border-b border-zinc-800 shrink-0 z-[1000] bg-zinc-900 relative flex-wrap">

            {/* Hazard type tabs */}
            <div className="flex gap-2">
              {(["ALL", "FLOOD", "HEAT", "WIND", "LANDSLIDE"] as HazardType[]).map((h) => (
                <button
                  key={h}
                  onClick={() => setHazard(h)}
                  className={`px-4 py-1 rounded-full text-sm border transition ${
                    hazard === h
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Severity filter pills */}
            <div className="flex gap-2">
              <button
                onClick={() => setSeverityFilter(severityFilter === "high" ? "all" : "high")}
                className={`text-xs px-3 py-1 rounded-full border transition font-medium ${
                  severityFilter === "high"
                    ? "bg-red-500/40 text-red-300 border-red-400 shadow-[0_0_8px_rgba(255,34,68,0.5)]"
                    : "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                }`}
              >
                🔴 High
              </button>
              <button
                onClick={() => setSeverityFilter(severityFilter === "medium" ? "all" : "medium")}
                className={`text-xs px-3 py-1 rounded-full border transition font-medium ${
                  severityFilter === "medium"
                    ? "bg-orange-500/40 text-orange-300 border-orange-400 shadow-[0_0_8px_rgba(255,165,0,0.5)]"
                    : "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30"
                }`}
              >
                🟠 Medium
              </button>
              <button
                onClick={() => setSeverityFilter(severityFilter === "low" ? "all" : "low")}
                className={`text-xs px-3 py-1 rounded-full border transition font-medium ${
                  severityFilter === "low"
                    ? "bg-yellow-500/40 text-yellow-300 border-yellow-400 shadow-[0_0_8px_rgba(255,204,0,0.5)]"
                    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30"
                }`}
              >
                🟡 Low
              </button>
            </div>
          </div>

          <div className="flex-1 relative min-h-0">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
                Loading impact map…
              </div>
            ) : (
              <ImpactMap
                actions={filteredActions}
                selectedActionId={selectedActionId}
                onSelectAction={setSelectedActionId}
                hazard={hazard}
                severityFilter={severityFilter}
              />
            )}
          </div>
        </section>

        {/* ── Action cards ── */}
        <section className="col-span-4 bg-zinc-900 rounded-xl p-4 flex flex-col min-h-0">

          <h2 className="text-lg font-semibold mb-1 shrink-0">Action Cards</h2>

          {/* Severity counts — display only */}
          <div className="flex gap-2 mb-3 shrink-0 flex-wrap">
            <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              🔴 {highActions.length} High
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
              🟠 {mediumActions.length} Medium
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              🟡 {lowActions.length} Low
            </span>
          </div>

          {/* Scrollable card list */}
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
            {sortedActions.length === 0 && !loading && (
              <div className="text-zinc-500 text-sm text-center mt-8">
                No actions for selected filter.
              </div>
            )}
            {sortedActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                selected={selectedActionId === action.id}
                onClick={() => setSelectedActionId(action.id)}
              />
            ))}
          </div>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="mt-4 shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition rounded-lg py-3 font-medium text-sm"
          >
            {downloading ? "Downloading…" : "📄 Download Report"}
          </button>
        </section>
      </main>
    </div>
  );
}