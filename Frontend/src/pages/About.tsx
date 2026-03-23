export default function About() {
  return (
    <div className="p-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">About WeatherOps</h1>

      <p className="text-zinc-400 leading-relaxed mb-6">
        WeatherOps is an agentic GeoAI decision-support platform designed to
        convert complex weather, terrain, and infrastructure data into
        actionable operational decisions.
      </p>

      <ul className="list-disc pl-6 space-y-2 text-zinc-300">
        <li>Multi-agent AI pipeline (Ingestion → Modeling → Risk → Decisions)</li>
        <li>Spatial risk visualization using GIS + Leaflet</li>
        <li>Confidence-aware recommendations</li>
        <li>Operational PDF reporting</li>
        <li>Frontend–backend decoupled architecture</li>
      </ul>

      <p className="mt-6 text-sm text-zinc-500">
        Built for disaster response, infrastructure planning, and climate resilience.
      </p>
    </div>
  );
}
