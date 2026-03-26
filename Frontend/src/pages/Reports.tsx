import { useEffect, useState } from "react";
import axios from "axios";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
} from "chart.js";
import { fetchMetrics, fetchDecisions, downloadReport } from "../services/api";
import MetricCard from "../components/cards/MetricCard";
import type { ActionDecision } from "../types/impact";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
);

interface BlockRisk {
  name: string;
  flood: number;
  heat: number;
  wind: number;
  landslide: number;
}

const API_BASE = "weatherops-production.up.railway.app";

export default function Reports() {
  const [metrics, setMetrics] = useState<any>(null);
  const [blockRisks, setBlockRisks] = useState<BlockRisk[]>([]);
  const [actions, setActions] = useState<ActionDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        const [metricsRes, decisionsRes, blockRiskRes] = await Promise.all([
          fetchMetrics(),
          fetchDecisions({
            forecast_hours: 72,
            rain_thresh: 80,
            temp_thresh: 35,
            wind_thresh: 40,
          }),
          axios.get(`${API_BASE}/api/block_risk`),
        ]);

        setMetrics(metricsRes);
        setActions(decisionsRes.actions || []);

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

  // Hazard scores for pie chart
  const hazardScores = metrics?.hazard_scores || {
    flood: 0,
    heat: 0,
    wind: 0,
    landslide: 0,
  };

  // Pie chart data – modern colors, centered
  const pieData = {
    labels: ["Flood", "Heat", "Wind", "Landslide"],
    datasets: [
      {
        data: [
          hazardScores.flood,
          hazardScores.heat,
          hazardScores.wind,
          hazardScores.landslide,
        ],
        backgroundColor: ["#2dd4bf", "#f97316", "#fbbf24", "#c084fc"],
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  };

  const pieOptions: any = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#8a93a8",
          font: { size: 11, weight: "bold" },
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.label}: ${ctx.raw.toFixed(1)}%`,
        },
        backgroundColor: "#111318",
        titleColor: "#e8ecf4",
        bodyColor: "#8a93a8",
        borderColor: "#2a2f3d",
        borderWidth: 1,
      },
    },
    layout: {
      padding: 10,
    },
  };

  // Bar chart – top 8 blocks, matching colors
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
        backgroundColor: "rgba(45,212,191,0.7)",
        borderColor: "#2dd4bf",
        borderWidth: 1,
      },
      {
        label: "Wind Risk (%)",
        data: sortedBlocks.map((b) => b.wind),
        backgroundColor: "rgba(251,146,60,0.7)",
        borderColor: "#f97316",
        borderWidth: 1,
      },
      {
        label: "Heat Risk (%)",
        data: sortedBlocks.map((b) => b.heat),
        backgroundColor: "rgba(251,191,36,0.7)",
        borderColor: "#fbbf24",
        borderWidth: 1,
      },
      {
        label: "Landslide Risk (%)",
        data: sortedBlocks.map((b) => b.landslide),
        backgroundColor: "rgba(192,132,252,0.7)",
        borderColor: "#c084fc",
        borderWidth: 1,
      },
    ],
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
      legend: { labels: { color: "#8a93a8", font: { size: 10 } } },
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

  const hasBlockData = sortedBlocks.length > 0;

  return (
    <div className="h-screen bg-black text-white overflow-y-auto p-8">
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
      <div className="grid grid-cols-4 gap-4 mb-4">
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

      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">

        <MetricCard
        title="High Risk Zones"
        value={metrics?.high_zones?.toString() ?? "0"}
        unit="zones"
        />

        <MetricCard
          title="Medium Risk Zones"
          value={metrics?.medium_zones?.toString() ?? "0"}
          unit="zones"
        />
        <MetricCard
          title="Low Risk Zones"
          value={metrics?.low_zones?.toString() ?? "0"}
          unit="zones"
        />
      </div>

      {/* Two‑column layout: Pie Chart + Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Pie Chart – centered with modern colors */}
        <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-4 flex flex-col items-center">
          <h2 className="text-lg font-semibold mb-2 text-center">
            Hazard Risk Distribution
          </h2>
          <div className="h-90 w-full max-w-sm mx-auto">
            <Pie data={pieData} options={pieOptions} />
          </div>
          <p className="text-center text-xs text-zinc-500 mt-2">
            Based on current forecast scores
          </p>
        </div>

        {/* Bar Chart – compact */}
        {hasBlockData ? (
          <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-2 text-center">
              Block‑Level Risk Breakdown
            </h2>
            <Bar data={barChartData} options={barOptions} height={200} />
          </div>
        ) : (
          <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-6 text-center text-zinc-400">
            No block risk data available.
          </div>
        )}
      </div>

      {/* Priority Actions */}
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