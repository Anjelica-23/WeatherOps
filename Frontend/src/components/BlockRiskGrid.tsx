type BlockRisk = {
  name: string;
  flood: string;
  heat: string;
  wind: string;
  landslide: string;
  description?: string;
  area?: string;
};

const getColor = (level: string) => {
  if (level === "CRITICAL") return "bg-red-600 text-white";
  if (level === "HIGH") return "bg-orange-600 text-white";
  if (level === "MODERATE") return "bg-amber-500 text-black";
  return "bg-emerald-600 text-white";
};

export default function BlockRiskGrid({ data }: { data: BlockRisk[] }) {
  return (
    <div>
      <div className="uppercase text-xs tracking-widest text-zinc-400 mb-4 px-1">
        AREA-WISE RISK BREAKDOWN • DEHRADUN TEHSILS
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {data.map((block) => (
          <div key={block.name} className="bg-[#181b22] border border-[#3a4155] rounded-2xl p-5 hover:border-amber-400 transition-all">
            <div className="font-bold text-lg mb-1">{block.name}</div>
            <div className="text-xs text-zinc-400 mb-4">{block.description || "Dehradun Tehsil"}</div>

            {["flood", "heat", "wind", "landslide"].map((h) => (
              <div key={h} className="flex justify-between items-center py-2.5 border-b border-[#2a2f3d] last:border-none">
                <span className="uppercase text-sm text-zinc-400">{h}</span>
                <span className={`px-4 py-0.5 text-xs font-medium rounded-full ${getColor(block[h as keyof BlockRisk] ?? "")}`}>
                  {block[h as keyof BlockRisk]}
                </span>
              </div>
            ))}

            {block.area && (
              <div className="mt-4 text-xs text-zinc-400 flex justify-between">
                <span>{block.area} km²</span>
                <span className="text-amber-400">▲ Wind</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 text-xs text-zinc-400 flex items-center gap-1">
        <span>▲ Highest composite risk tehsils:</span>
        <span className="text-red-400">Tyuni (77%)</span>
        <span className="text-orange-400">Chakrata (72%)</span>
        <span className="text-yellow-400">Rishikesh (50%)</span>
      </div>
    </div>
  );
}