interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
}

export default function MetricCard({ title, value, unit }: MetricCardProps) {

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">

      <div className="text-xs text-zinc-400 uppercase">
        {title}
      </div>

      <div className="text-2xl font-semibold text-yellow-400">
        {value} {unit}
      </div>

    </div>
  );
}