import axios from "axios";
import type { AgentDecisionOutput } from "../types/impact";


// ============================================
// API CONFIG
// ============================================

const API_BASE = "https://weatherops-backend.onrender.com";

const api = axios.create({
  baseURL: API_BASE
});


// ============================================
// FETCH DECISIONS FROM BACKEND
// ============================================

export async function fetchDecisions(): Promise<AgentDecisionOutput> {
  try {
    const res = await api.get<AgentDecisionOutput>("/api/decisions");
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

  const res = await axios.get(`${API_BASE}/api/metrics`);

  return res.data;

}
export async function fetchROIBoundary() {

  const res = await axios.get(`${API_BASE}/api/roi_boundary`);

  return res.data;

}

export const fetchDehradunBlocks = async () => {
  const res = await fetch("http://localhost:8000/api/dehradun_blocks")
  return res.json()
}