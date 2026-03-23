import { downloadReport } from "../services/api";

export default function Reports() {
  const handleDownload = async () => {
    const blob = await downloadReport();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "WeatherOps_Report.pdf";
    a.click();

    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Operational Reports</h1>

      <p className="text-zinc-400 mb-6">
        Download AI-generated, one-page operational briefs based on
        real-time GeoAI weather risk analysis.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-medium mb-2">
          WeatherOps Impact Brief
        </h2>

        <p className="text-sm text-zinc-400 mb-4">
          Includes risk zones, confidence intervals, and recommended actions.
        </p>

        <button
          onClick={handleDownload}
          className="bg-blue-600 hover:bg-blue-700 transition px-5 py-3 rounded-lg font-medium"
        >
          📄 Download PDF Report
        </button>
      </div>
    </div>
  );
}
