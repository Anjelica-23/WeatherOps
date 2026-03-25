import { useEffect, useState } from "react";
import axios from "axios";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { fetchMetrics, fetchDecisions, downloadReport } from "../services/api";
import MetricCard from "../components/cards/MetricCard";
import type { ActionDecision } from "../types/impact";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Types (simplified, can import from Dashboard if shared)
interface RiskEvolution {
  time: string[];
  flood: number[];
  heat: number[];
  wind: number[];
  landslide: number[];
}

interface BlockRisk {
  name: string;
  flood: number;
  heat: number;
  wind: number;
  landslide: number;
}

const API_BASE = "https://weatherops-production.up.railway.app";

export default function Reports() {
  const [metrics, setMetrics] = useState<any>(null);
  const [riskEvolution, setRiskEvolution] = useState<RiskEvolution>({
    time: [],
    flood: [],
    heat: [],
    wind: [],
    landslide: [],
  });
  const [blockRisks, setBlockRisks] = useState<BlockRisk[]>([]);
  const [actions, setActions] = useState<ActionDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    const fetchReportData = async () => {
      try {
        const [metricsRes, decisionsRes, riskEvolRes, blockRiskRes] =
          await Promise.all([
            fetchMetrics(),
            fetchDecisions({
              forecast_hours: 72,
              rain_thresh: 80,
              temp_thresh: 35,
              wind_thresh: 40,
            }),
            axios.get(`${API_BASE}/api/risk_evolution?horizon=72`),
            axios.get(`${API_BASE}/api/block_risk`),
          ]);

        setMetrics(metricsRes);
        setActions(decisionsRes.actions || []);
        setRiskEvolution(riskEvolRes.data);
        // Convert blockRisk object to array for easier mapping
        if (blockRiskRes.data) {
          const blocksArray = Object.entries(blockRiskRes.data).map(
            ([name, risks]: [string, any]) => ({
              name,
              flood: risks.flood * 100,
              heat: risks.heat * 100,
              wind: risks.wind * 100,
              landslide: risks.landslide * 100,
            })
          );
          setBlockRisks(blocksArray);
        }
      } catch (err) {
        console.error("Error fetching report data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await downloadReport();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
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

  // Prepare risk evolution chart data
  const riskEvolutionLabels = (riskEvolution?.time || []).map((t) =>
    new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
  );

  const riskEvolutionData = {
    labels: riskEvolutionLabels,
    datasets: [
      {
        label: "Flood Risk",
        data: riskEvolution.flood,
        borderColor: "#00c9a7",
        backgroundColor: "rgba(0,201,167,0.1)",
        fill: true,
        tension: 0.4,
      },
      {
        label: "Heat Risk",
        data: riskEvolution.heat,
        borderColor: "#e84040",
        backgroundColor: "rgba(232,64,64,0.1)",
        fill: true,
        tension: 0.4,
      },
      {
        label: "Wind Risk",
        data: riskEvolution.wind,
        borderColor: "#f0a500",
        backgroundColor: "rgba(240,165,0,0.1)",
        fill: true,
        tension: 0.4,
      },
      {
        label: "Landslide Risk",
        data: riskEvolution.landslide,
        borderColor: "#a78bfa",
        backgroundColor: "rgba(167,139,250,0.1)",
        fill: true,
        tension: 0.4,
      },
    ],
  };

  // Prepare block risk bar chart data (top 8 blocks by average risk)
  const sortedBlocks = [...blockRisks]
    .map((b) => ({
      ...b,
      avgRisk: (b.flood + b.heat + b.wind + b.landslide) / 4,
    }))
    .sort((a, b) => b.avgRisk - a.avgRisk)
    .slice(0, 8);

  const barChartData = {
    labels: sortedBlocks.map((b) => b.name),
    datasets: [
      {
        label: "Flood Risk (%)",
        data: sortedBlocks.map((b) => b.flood),
        backgroundColor: "rgba(0,201,167,0.7)",
        borderColor: "#00c9a7",
        borderWidth: 1,
      },
      {
        label: "Wind Risk (%)",
        data: sortedBlocks.map((b) => b.wind),
        backgroundColor: "rgba(240,165,0,0.7)",
        borderColor: "#f0a500",
        borderWidth: 1,
      },
      {
        label: "Heat Risk (%)",
        data: sortedBlocks.map((b) => b.heat),
        backgroundColor: "rgba(232,64,64,0.7)",
        borderColor: "#e84040",
        borderWidth: 1,
      },
      {
        label: "Landslide Risk (%)",
        data: sortedBlocks.map((b) => b.landslide),
        backgroundColor: "rgba(167,139,250,0.7)",
        borderColor: "#a78bfa",
        borderWidth: 1,
      },
    ],
  };

  // Chart options (cast to any to avoid TypeScript deep type mismatch)
  const lineOptions: any = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      y: {
        min: 0,
        max: 1,
        grid: { color: "#2a2f3d" },
        ticks: {
          callback: (val: any) => {
            if (val === 0) return "LOW";
            if (val === 0.25) return "MOD";
            if (val === 0.5) return "HIGH";
            if (val === 0.75) return "CRIT";
            return "";
          },
          color: "#8a93a8",
        },
      },
      x: {
        ticks: { color: "#8a93a8", maxRotation: 45, autoSkip: true, maxTicksLimit: 8 },
        grid: { color: "#2a2f3d" },
      },
    },
    plugins: {
      legend: { labels: { color: "#8a93a8" } },
      tooltip: { mode: "index", intersect: false },
    },
  };

  const barOptions: any = {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      y: {
        title: { display: true, text: "Risk (%)", color: "#8a93a8" },
        ticks: { color: "#8a93a8" },
        grid: { color: "#2a2f3d" },
      },
      x: {
        ticks: { color: "#8a93a8", maxRotation: 45, autoSkip: true },
        grid: { display: false },
      },
    },
    plugins: {
      legend: { labels: { color: "#8a93a8" } },
      tooltip: { mode: "index", intersect: false },
    },
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        Loading report...
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Operational Weather Report</h1>
          <p className="text-zinc-400 mt-1">
            Generated: {new Date().toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="bg-amber-600 hover:bg-amber-700 px-5 py-2 rounded-lg font-medium transition flex items-center gap-2"
        >
          {downloading ? "Exporting..." : "📄 Download PDF"}
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <MetricCard
          title="Rain Peak"
          value={metrics?.rain_peak?.toFixed(1) ?? "0.0"}
          unit="mm/hr"
        />
        <MetricCard
          title="Temp Peak"
          value={metrics?.temp_peak?.toFixed(1) ?? "28.2"}
          unit="°C"
        />
        <MetricCard
          title="Wind Peak"
          value={metrics?.wind_peak?.toFixed(1) ?? "22.0"}
          unit="km/h"
        />
        <MetricCard
          title="Flood Risk"
          value={metrics?.flood_risk?.toFixed(1) ?? "0.0"}
          unit="%"
        />
        <MetricCard
          title="High Risk Zones"
          value={metrics?.high_zones?.toString() ?? "0"}
          unit="zones"
        />
      </div>

      {/* Risk Evolution Chart */}
      <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Risk Evolution – 72‑Hour Forecast</h2>
        <Line data={riskEvolutionData} options={lineOptions} height={300} />
      </div>

      {/* Block Risk Bar Chart */}
      {sortedBlocks.length > 0 && (
        <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Block‑Level Risk Breakdown</h2>
          <Bar data={barChartData} options={barOptions} height={350} />
        </div>
      )}

      {/* Top Recommended Actions */}
      <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">Priority Actions</h2>
        {actions.length === 0 ? (
          <p className="text-zinc-400">No immediate actions required.</p>
        ) : (
          <div className="space-y-4">
            {actions.slice(0, 5).map((action) => (
              <div
                key={action.id}
                className="border-l-4 border-amber-500 bg-black/30 p-4 rounded"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-lg font-medium">{action.title}</div>
                    <div className="text-sm text-zinc-400 mt-1">
                      📍 {action.where} · ⏱ {action.when}
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-bold rounded-full ${
                      action.locations[0]?.severity === "high"
                        ? "bg-red-500/20 text-red-400"
                        : action.locations[0]?.severity === "medium"
                        ? "bg-orange-500/20 text-orange-400"
                        : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {action.locations[0]?.severity?.toUpperCase()}
                  </span>
                </div>
                <div className="text-sm text-zinc-300 mt-2">
                  Confidence: {Math.round(action.confidence[0] * 100)}–{Math.round(action.confidence[1] * 100)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}