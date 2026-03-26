// components/TehsilCard.tsx
interface TehsilCardProps {
  tehsil: {
    name: string;
    notes: string;
    areaKm2: number;
    hazards: {
      flood: number;
      heat: number;
      wind: number;
      landslide: number;
    };
    interp: number;
    localPts: number;
    confidence: number;
    reason: string;
  };
}

function getRiskLevel(score: number): string {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.5) return "HIGH";
  if (score >= 0.25) return "MODERATE";
  return "LOW";
}

function getRiskColor(score: number): string {
  if (score >= 0.75) return "#e84040";
  if (score >= 0.5) return "#f06830";
  if (score >= 0.25) return "#f0a500";
  return "#00c9a7";
}

export default function TehsilCard({ tehsil }: TehsilCardProps) {
  const hazardEntries = Object.entries(tehsil.hazards) as [string, number][];
  const dominantHazard = hazardEntries.reduce((a, b) => (a[1] > b[1] ? a : b))[0];

  return (
    <div className="bg-[#181b22] border border-[#3a4155] rounded-2xl p-5 hover:border-amber-400 transition-all">
      <h3 className="font-bold text-lg mb-1">{tehsil.name}</h3>
      <p className="text-xs text-zinc-400 mb-4">{tehsil.notes}</p>

      {hazardEntries.map(([hazard, score]) => {
        const level = getRiskLevel(score);
        const color = getRiskColor(score);
        const percent = score * 100;
        return (
          <div key={hazard} className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="uppercase text-zinc-400">{hazard}</span>
              <span style={{ color }}>{level}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${percent}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}

      <div className="flex justify-between text-xs text-zinc-400 mb-2">
        <span>{tehsil.areaKm2} km²</span>
        <span className="text-amber-400">
          ▲ {dominantHazard.charAt(0).toUpperCase() + dominantHazard.slice(1)}
        </span>
      </div>

      <div className="text-xs text-zinc-400 font-mono mb-1">
        Interp={tehsil.interp.toFixed(2)} - LocalPts={tehsil.localPts} - Conf={tehsil.confidence.toFixed(0)}% {getRiskLevel(tehsil.interp)}: {tehsil.reason}
      </div>
    </div>
  );
}