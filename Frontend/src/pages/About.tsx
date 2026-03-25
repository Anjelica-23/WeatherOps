import { Zap, Map, TrendingUp, Shield, FileText } from "lucide-react";

export default function About() {
  return (
    <div className="bg-black text-white min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Hero section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-2 bg-amber-500/10 rounded-full mb-4">
            <Zap className="w-6 h-6 text-amber-500" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
            WeatherOps
          </h1>
          <p className="text-xl text-zinc-400 mt-2 max-w-2xl mx-auto">
            Agentic GeoAI for weather‑impact decision support
          </p>
          <p className="text-zinc-500 max-w-2xl mx-auto mt-4">
            Bridging real‑time meteorology, geospatial analytics, and operational AI to deliver
            confidence‑aware actions for disaster resilience.
          </p>
        </div>

        {/* Two‑column layout: left description, right key features */}
        <div className="grid md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2 className="text-2xl font-semibold mb-4">The Problem</h2>
            <p className="text-zinc-300 leading-relaxed">
              Extreme weather events are increasing in frequency and intensity.
              Emergency responders, infrastructure managers, and urban planners
              often lack actionable, spatially‑explicit, and confidence‑aware
              information to make timely decisions.
            </p>
            <div className="mt-6">
              <h2 className="text-2xl font-semibold mb-4">Our Solution</h2>
              <p className="text-zinc-300 leading-relaxed">
                WeatherOps automates the entire decision pipeline:
              </p>
              <ul className="list-disc pl-5 text-zinc-300 space-y-1 mt-2">
                <li>Ingestion of live Open‑Meteo forecasts</li>
                <li>Terrain‑aware blending (slope, heat index, flood proxy)</li>
                <li>Multi‑hazard risk scoring (Flood, Heat, Wind, Landslide)</li>
                <li>Actionable, geo‑localised recommendations with confidence intervals</li>
                <li>Model evaluation and explainability (SHAP, spatial cross‑validation)</li>
              </ul>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-4">Key Capabilities</h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-start gap-3">
                <Map className="w-5 h-5 text-emerald-400 mt-1" />
                <div>
                  <h3 className="font-medium">Spatial Risk Visualization</h3>
                  <p className="text-sm text-zinc-400">
                    Interactive maps with hazard‑specific layers, tehsil‑level choropleths,
                    and dynamic point clustering.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-amber-400 mt-1" />
                <div>
                  <h3 className="font-medium">Multi‑Hazard Risk Models</h3>
                  <p className="text-sm text-zinc-400">
                    Machine learning models (Random Forest, XGBoost, CatBoost) trained on
                    historical data with spatial cross‑validation.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-red-400 mt-1" />
                <div>
                  <h3 className="font-medium">Confidence‑Aware Actions</h3>
                  <p className="text-sm text-zinc-400">
                    Every recommendation includes a confidence interval,
                    helping users weigh risk against uncertainty.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-400 mt-1" />
                <div>
                  <h3 className="font-medium">Operational Reporting</h3>
                  <p className="text-sm text-zinc-400">
                    One‑click PDF reports with risk summaries, charts, and
                    priority actions for field deployment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5‑Agent Pipeline Diagram (simplified) */}
        <div className="bg-[#111318] border border-[#2a2f3d] rounded-xl p-6 mb-12">
          <h2 className="text-2xl font-semibold mb-6 text-center">5‑Agent AI Pipeline</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-center">
            {[
              { name: "Ingestion", icon: <Zap className="w-6 h-6" />, desc: "Live forecast fetch" },
              { name: "Modeling", icon: <TrendingUp className="w-6 h-6" />, desc: "Terrain blending" },
              { name: "Hazards", icon: <Map className="w-6 h-6" />, desc: "Risk scoring" },
              { name: "Decision", icon: <Shield className="w-6 h-6" />, desc: "Action generation" },
              { name: "Evaluation", icon: <FileText className="w-6 h-6" />, desc: "Model validation" },
            ].map((agent, idx) => (
              <div key={idx} className="p-4 bg-black/30 rounded-lg">
                <div className="flex justify-center mb-2 text-amber-400">{agent.icon}</div>
                <div className="font-medium text-lg">{agent.name}</div>
                <div className="text-xs text-zinc-500 mt-1">{agent.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Technology stack */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Technology Stack</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#111318] border border-[#2a2f3d] rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">🐍</div>
              <div className="font-medium">Python / FastAPI</div>
              <div className="text-xs text-zinc-500">Backend & ML</div>
            </div>
            <div className="bg-[#111318] border border-[#2a2f3d] rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">⚛️</div>
              <div className="font-medium">React / TypeScript</div>
              <div className="text-xs text-zinc-500">Frontend</div>
            </div>
            <div className="bg-[#111318] border border-[#2a2f3d] rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">🗺️</div>
              <div className="font-medium">Leaflet / MapLibre</div>
              <div className="text-xs text-zinc-500">Spatial visualization</div>
            </div>
            <div className="bg-[#111318] border border-[#2a2f3d] rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">🤖</div>
              <div className="font-medium">Scikit‑learn / XGBoost</div>
              <div className="text-xs text-zinc-500">ML models</div>
            </div>
          </div>
        </div>

        {/* Footer with contact / credits */}
        <div className="border-t border-[#2a2f3d] pt-8 mt-8 text-center text-zinc-500 text-sm">
          <p>© 2025 WeatherOps. Built for disaster resilience and operational decision‑making.</p>
          <div className="flex justify-center gap-4 mt-4">
            <a href="#" className="hover:text-white transition">
              GitHub
            </a>
            <a href="#" className="hover:text-white transition">
              Contact
            </a>
            <a href="#" className="hover:text-white transition">
              Website
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}