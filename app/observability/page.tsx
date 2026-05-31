import ObservabilityDashboard from "@/components/ObservabilityDashboard";
import Disclaimer from "@/components/Disclaimer";

export default function ObservabilityPage() {
  return (
    <div className="space-y-2">
      <div className="bg-[var(--navy-900)] rounded-lg p-5 border border-slate-800">
        <ObservabilityDashboard />
      </div>
      <Disclaimer />
    </div>
  );
}
