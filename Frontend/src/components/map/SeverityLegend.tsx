export default function SeverityLegend() {
  return (
    <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur text-white p-3 rounded-lg text-sm space-y-2">
      <h4 className="font-semibold text-xs text-zinc-300">Severity</h4>

      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500"></span>
        <span>High</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-orange-400"></span>
        <span>Medium</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
        <span>Low</span>
      </div>
    </div>
  );
}
