import { useEffect, useState, useCallback } from "react";
import ImpactMap from "../components/map/ImpactMap";
import ActionCard from "../components/cards/ActionCard";
import { fetchDecisions } from "../services/api";
import type { ActionDecision } from "../types/impact";

type HazardType = "ALL" | "FLOOD" | "HEAT" | "WIND" | "LANDSLIDE";
type SeverityFilter = "all" | "high" | "medium" | "low";

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortBySeverity(actions: ActionDecision[]): ActionDecision[] {
  return [...actions].sort((a, b) =>
    (SEVERITY_ORDER[a.locations[0]?.severity ?? "low"] ?? 2) -
    (SEVERITY_ORDER[b.locations[0]?.severity ?? "low"] ?? 2)
  );
}

export default function MapPage() {
  const [actions, setActions] = useState<ActionDecision[]>([]);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [hazard, setHazard] = useState<HazardType>("ALL");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("--");
  const [refreshing, setRefreshing] = useState(false);

  const forecastHours = 72;
  const rainThreshold = 80;
  const heatThreshold = 35;
  const windThreshold = 40;

  const loadActions = useCallback(async () => {
    try {
      setRefreshing(true);
      const decisionsRes = await fetchDecisions({
        forecast_hours: forecastHours,
        rain_thresh: rainThreshold,
        temp_thresh: heatThreshold,
        wind_thresh: windThreshold,
      });
      setActions(decisionsRes.actions || []);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadActions();
    const interval = setInterval(loadActions, 3600000);
    return () => clearInterval(interval);
  }, [loadActions]);

  const filteredActions =
    hazard === "ALL"
      ? actions
      : actions.filter((a) => a.hazard?.toUpperCase() === hazard);
  const severityFiltered =
    severityFilter === "all"
      ? filteredActions
      : filteredActions.filter((a) => a.locations[0]?.severity === severityFilter);
  const sortedActions = sortBySeverity(severityFiltered).slice(0, 40);

  const highActions = sortBySeverity(filteredActions)
    .filter((a) => a.locations[0]?.severity === "high")
    .slice(0, 15);
  const mediumActions = sortBySeverity(filteredActions)
    .filter((a) => a.locations[0]?.severity === "medium")
    .slice(0, 15);
  const lowActions = sortBySeverity(filteredActions)
    .filter((a) => a.locations[0]?.severity === "low")
    .slice(0, 10);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        Loading map...
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-white overflow-y-auto flex flex-col font-sans">
      <div className="flex justify-between items-center px-6 py-4">
        <div className="text-xl font-semibold">WeatherOps GeoAI Map</div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">Last Updated: {lastUpdated}</span>
          <button
            onClick={loadActions}
            disabled={refreshing}
            className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg text-xs transition disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "⟳ Refresh"}
          </button>
        </div>
      </div>

      {/* Map + Action Cards Row */}
      <div className="flex-1 px-6 min-h-0 pb-6">
        <div className="flex flex-col lg:flex-row gap-6 h-full">
          {/* Map Section */}
          <section className="flex-1 bg-zinc-900 rounded-3xl flex flex-col overflow-hidden min-h-0">
            <div className="flex gap-2 p-4 border-b border-[#2a2f3d]">
              {(["ALL", "FLOOD", "HEAT", "WIND", "LANDSLIDE"] as HazardType[]).map((h) => (
                <button
                  key={h}
                  onClick={() => setHazard(h)}
                  className={`px-6 py-2 rounded-full text-sm border transition-all ${
                    hazard === h
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="flex gap-2 p-3 border-b border-[#2a2f3d]">
              {(["all", "high", "medium", "low"] as SeverityFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`px-4 py-1 text-xs rounded-full border transition-all ${
                    severityFilter === s
                      ? "bg-white text-black"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex-1 relative min-h-0">
              <ImpactMap
                actions={filteredActions}
                selectedActionId={selectedActionId}
                onSelectAction={setSelectedActionId}
                hazard={hazard}
                severityFilter={severityFilter}
              />
            </div>
          </section>

          {/* Action Cards Panel */}
          <section className="w-full lg:w-96 bg-zinc-900 rounded-3xl p-6 flex flex-col min-h-0">
            <h2 className="text-lg font-semibold mb-4">Action Cards</h2>
            <div className="flex gap-2 mb-4">
              <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">
                🔴 {highActions.length} High
              </span>
              <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs">
                🟠 {mediumActions.length} Medium
              </span>
              <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">
                🟡 {lowActions.length} Low
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {sortedActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  selected={selectedActionId === action.id}
                  onClick={() => setSelectedActionId(action.id)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}