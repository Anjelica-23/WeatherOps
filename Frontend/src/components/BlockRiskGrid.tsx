// components/BlockRiskGrid.tsx
import TehsilCard from "./TehsilCard";

interface BlockRiskGridProps {
  tehsils: Array<{
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
  }>;
}

export default function BlockRiskGrid({ tehsils }: BlockRiskGridProps) {
  if (!tehsils.length) {
    return (
      <div className="text-center text-zinc-400 py-8">
        No tehsil data available.
      </div>
    );
  }

  return (
    <div>
      <div className="uppercase text-xs tracking-widest text-zinc-400 mb-4 px-1">
        AREA-WISE RISK BREAKDOWN · DEHRADUN TEHSILS
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {tehsils.map((tehsil) => (
          <TehsilCard key={tehsil.name} tehsil={tehsil} />
        ))}
      </div>

      <div className="mt-6 text-xs text-zinc-400 flex items-center gap-1">
        <span>▲ Highest composite risk tehsils:</span>
        {tehsils
          .sort((a, b) => b.interp - a.interp)
          .slice(0, 3)
          .map((t, idx) => (
            <span key={t.name} className="text-red-400">
              {t.name} ({(t.interp * 100).toFixed(0)}%)
              {idx < 2 ? "," : ""}
            </span>
          ))}
      </div>
    </div>
  );
}