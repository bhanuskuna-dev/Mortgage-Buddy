import MortgageCoach from "@/components/MortgageCoach";
import Disclaimer from "@/components/Disclaimer";

export default function ChatPage() {
  return (
    <div className="space-y-2">
      <div className="bg-[var(--navy-900)] rounded-lg p-5 border border-slate-800">
        <h1 className="text-lg font-semibold text-white mb-1">Mortgage Coach</h1>
        <p className="text-xs text-slate-500 mb-4">
          Every response is grounded in Fannie Mae, CFPB ATR/QM, and FHA regulatory documents with citations.
        </p>
        <MortgageCoach />
      </div>
      <Disclaimer />
    </div>
  );
}
