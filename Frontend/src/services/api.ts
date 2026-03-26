import axios from "axios";
import type { AgentDecisionOutput } from "../types/impact";
import { API_BASE } from "../config";

// ============================================
// API CONFIG
// ============================================

const api = axios.create({
  baseURL: API_BASE
});


// ============================================
// FETCH DECISIONS FROM BACKEND
// ============================================

export async function fetchDecisions(params: {
  forecast_hours: number;
  rain_thresh: number;
  temp_thresh: number;
  wind_thresh: number;
}): Promise<AgentDecisionOutput> {
  try {
    const res = await api.get<AgentDecisionOutput>("/api/decisions", {
      params, // ✅ VERY IMPORTANT
    });

    return res.data;
  } catch (error) {
    console.error("Error fetching decisions:", error);
    throw error;
  }
}


// ============================================
// DOWNLOAD PDF REPORT
// ============================================

export async function downloadReport(): Promise<Blob> {
  try {
    const res = await api.get("/api/report", {
      responseType: "blob",
    });

    return res.data;
  } catch (error) {
    console.error("Error downloading report:", error);
    throw error;
  }
}
export async function fetchMetrics() {

  const res = await api.get("/api/metrics");

  return res.data;

}
export async function fetchROIBoundary() {

  const res = await axios.get(`${API_BASE}/api/roi_boundary`);

  return res.data;

}

export const fetchDehradunBlocks = async () => {
  const res = await fetch("https://weatherops-production.up.railway.app/api/dehradun_blocks")
  return res.json()
}