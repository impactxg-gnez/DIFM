import { runExtractionPipeline } from "@/lib/pricing/extractionEngine";
import { normalizeTier } from '@/lib/pricing/tierNormalization';

export async function POST(req: Request) {
  try {
    const { userInput } = await req.json();
    if (!userInput || typeof userInput !== "string") {
      return new Response(JSON.stringify({ error: "userInput is required" }), { status: 400 });
    }

    const extraction = await runExtractionPipeline(userInput);

    return Response.json({
      jobs: extraction.jobs,
      quantities: extraction.quantitiesList,
      total_minutes: extraction.total_minutes,
      tier: normalizeTier(extraction.tier),
      clarifiers: extraction.clarifiers.map((c) => c.tag),
      // Extended diagnostics payload for UI/debug.
      jobDetails: extraction.jobDetails,
      capabilities: extraction.capabilities,
      visits: Array.isArray(extraction.visits)
        ? extraction.visits.map((visit: any) => ({
          ...visit,
          tier: normalizeTier(visit?.tier),
          display_price: Number(visit?.price ?? 0),
        }))
        : extraction.visits,
      price: extraction.price,
      display_price: Number(extraction.price ?? 0),
      flags: extraction.flags,
      message: extraction.message,
      warnings: extraction.warnings ?? [],
    });

  } catch (err: any) {
    console.error("AI Extraction Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
