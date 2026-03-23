import type { AgentDecisionOutput } from "../types/impact";

export const mockAgentOutput: AgentDecisionOutput = {
  generatedAt: "2026-01-14T12:00:00Z",
  roi: "Dehradun District",
  actions: [
    {
      id: "wind-001",
      title: "Secure power infrastructure",
      hazard: "wind",
      where: "Transmission corridors near Dehradun",
      when: "Within 24 hours",
      why: "Forecasted high wind gusts (60-70 km/h)",
      confidence: [0.66, 0.96],
      locations: [
        {
          id: "loc-1",
          lat: 30.32,
          lon: 78.03,
          severity: "high",
        },
        {
          id: "loc-2",
          lat: 30.28,
          lon: 77.98,
          severity: "medium",
        },
      ],
    },
  ],
};