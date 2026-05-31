import EvalPanel from "@/components/EvalPanel";
import Disclaimer from "@/components/Disclaimer";

export default function EvalsPage() {
  return (
    <div className="space-y-2">
      <div className="bg-[var(--navy-900)] rounded-lg p-5 border border-slate-800">
        <EvalPanel />
      </div>
      <Disclaimer />
    </div>
  );
}
