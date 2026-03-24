export type HazardType = "flood" | "heat" | "wind" | "landslide";

export type SeverityLevel = "low" | "medium" | "high";

export interface RiskLocation {
  id: string;
  lat: number;
  lon: number;
  severity: SeverityLevel;
  location_name: string;
}

export interface ActionDecision {
  id: string;
  title: string;
  where: string;
  when: string;
  hazard: "FLOOD" | "HEAT" | "WIND" | "LANDSLIDE";
  confidence: [number, number];
  locations: {
    id: string;
    lat: number;
    lon: number;
    severity: "low" | "medium" | "high";
    location_name: string;
  }[];
}

export interface AgentDecisionOutput {
  actions: ActionDecision[];
  risk?: Record<string, number>;
  risk_ci?: Record<string, [number, number]>;
}