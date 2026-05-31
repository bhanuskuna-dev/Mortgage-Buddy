import { calculateMortgage, checkRegulatory } from "@/lib/calculator";
import type { MortgageProfile } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  try {
    const profile: MortgageProfile = await req.json();

    if (
      !profile.grossMonthlyIncome || profile.grossMonthlyIncome <= 0 ||
      !profile.homePrice || profile.homePrice <= 0 ||
      profile.downPayment < 0 ||
      profile.downPayment >= profile.homePrice
    ) {
      return Response.json({ error: "Invalid input values" }, { status: 400 });
    }

    const calculator = calculateMortgage(profile);
    const regulatory = checkRegulatory(calculator, profile);

    return Response.json({ calculator, regulatory });
  } catch (err) {
    console.error("[calculate] error:", err);
    return Response.json({ error: "Calculation failed" }, { status: 500 });
  }
}
