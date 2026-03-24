// components/cards/MetricCard.tsx
interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  ci?: [number, number];        // optional confidence interval
}

export default function MetricCard({ title, value, unit, ci }: MetricCardProps) {
  return (
    <div className="bg-[#181b22] border border-[#3a4155] rounded-2xl p-5 hover:border-[#4a5568] transition-all">
      <div className="text-xs uppercase tracking-widest text-zinc-400 mb-2">
        {title}
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-semibold text-amber-400 tabular-nums">
          {value}
        </span>
        {unit && <span className="text-sm text-zinc-400">{unit}</span>}
      </div>

      {ci && (
        <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
          <span>CI:</span>
          <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-1 bg-amber-400 rounded-full"
              style={{
                marginLeft: `${ci[0]}%`,
                width: `${ci[1] - ci[0]}%`,
              }}
            />
          </div>
          <span className="font-mono">{ci[0]}–{ci[1]}</span>
        </div>
      )}
    </div>
  );
}