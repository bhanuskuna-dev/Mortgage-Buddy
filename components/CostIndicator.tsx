"use client";

import { useEffect, useState } from "react";
import { getSessionStats } from "@/lib/observability";
import { DollarSign } from "lucide-react";

export default function CostIndicator() {
  const [cost, setCost] = useState(0);

  useEffect(() => {
    const update = () => setCost(getSessionStats().totalCost);
    update();
    const id = setInterval(update, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
      <DollarSign className="w-3 h-3" />
      <span>${cost.toFixed(4)}</span>
    </div>
  );
}
