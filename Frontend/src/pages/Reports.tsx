import { useEffect, useState } from "react";
import axios from "axios";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import MetricCard from "../components/cards/MetricCard";
import { fetchMetrics, fetchDecisions } from "../services/api";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface ForecastPoint {
  time: string;
  rain_adj: number;
  temp_c: number;
  wind_kmph: number;
  heat_index: number;
  flood_proxy: number;
}

interface RiskEvolution {
  time: string[];
  flood: number[];
  heat: number[];
  wind: number[];
  landslide: number[];
}

const API_BASE = "https://weatherops-production.up.railway.app";

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [riskScores, setRiskScores] = useState<Record<string, number>>({ Flood: 0, Heat: 0, Wind: 0, Landslide: 0 });
  const [forecastData, setForecastData] = useState<ForecastPoint[]>([]);
  const [riskEvolution, setRiskEvolution] = useState<RiskEvolution>({
    time: [], flood: [], heat: [], wind: [], landslide: [],
  });

  const loadReportData = async () => {
    try {
      const [metricsRes, decisionsRes, forecastRes, riskEvolRes] = await Promise.all([
        fetchMetrics(),
        fetchDecisions({ forecast_hours: 72, rain_thresh: 80, temp_thresh: 35, wind_thresh: 40 }),
        axios.get(`${API_BASE}/api/forecast`),
        axios.get(`${API_BASE}/api/risk_evolution`),
      ]);

      setMetrics(metricsRes);
      if (decisionsRes.risk) setRiskScores(decisionsRes.risk);
      setForecastData(forecastRes.data?.forecast || forecastRes.data || []);

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
    } catch (err) {
      console.error("Error loading report data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, []);

  const computePeak = (values: number[]) => {
    if (!values || values.length === 0) return { peak: 0 };
    return { peak: Math.max(...values) };
  };
  const rainPeak = computePeak(forecastData.map(p => p.rain_adj));
  const tempPeak = computePeak(forecastData.map(p => p.heat_index));
  const windPeak = computePeak(forecastData.map(p => p.wind_kmph));
  const floodPeak = computePeak(forecastData.map(p => p.flood_proxy));

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
    return <div className="h-screen flex items-center justify-center bg-black text-white">Loading report...</div>;
  }

  const now = new Date();
  const formattedDate = now.toLocaleString();

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">WeatherOps</h1>
          <h2 className="text-xl text-zinc-400 mb-4">Operational Weather Report</h2>
          <p className="text-sm text-zinc-500">Generated: {formattedDate}</p>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <MetricCard title="RAIN PEAK" value={rainPeak.peak.toFixed(1)} unit="mm/hr" />
          <MetricCard title="TEMP PEAK" value={metrics?.temp_peak?.toFixed(1) ?? tempPeak.peak.toFixed(1)} unit="°C" />
          <MetricCard title="WIND PEAK" value={metrics?.wind_peak?.toFixed(1) ?? windPeak.peak.toFixed(1)} unit="km/h" />
          <MetricCard title="FLOOD RISK" value={((riskScores.Flood || 0) * 100).toFixed(1)} unit="%" />
          <MetricCard title="HIGH RISK ZONES" value={metrics?.high_zones ?? "0"} unit="zones" />
        </div>

        {/* Risk Evolution Chart */}
        <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-6 mb-8">
          <h3 className="text-lg font-semibold mb-4">Risk Evolution – 72‑Hour Forecast</h3>
          <Line
            data={riskEvolutionData}
            options={{
              responsive: true,
              maintainAspectRatio: true,
              scales: {
                y: {
                  min: 0,
                  max: 1,
                  grid: { color: "#2a2f3d" },
                  ticks: {
                    callback: (val) => {
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
            }}
          />
        </div>

        {/* Additional Summary (optional) */}
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-5">
            <h4 className="text-sm font-mono text-zinc-400 mb-2">MEDIUM RISK ZONES</h4>
            <div className="text-3xl font-bold text-orange-400">{metrics?.medium_zones ?? "0"}</div>
            <div className="text-xs text-zinc-500 mt-1">zones</div>
          </div>
          <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-5">
            <h4 className="text-sm font-mono text-zinc-400 mb-2">LOW RISK ZONES</h4>
            <div className="text-3xl font-bold text-yellow-400">{metrics?.low_zones ?? "0"}</div>
            <div className="text-xs text-zinc-500 mt-1">zones</div>
          </div>
          <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-5">
            <h4 className="text-sm font-mono text-zinc-400 mb-2">ACTIVE HAZARDS</h4>
            <div className="text-3xl font-bold text-amber-400">
              {Object.values(riskScores).filter(s => s >= 0.25).length}
            </div>
            <div className="text-xs text-zinc-500 mt-1">above threshold</div>
          </div>
        </div>
      </div>
    </div>
  );
}