import { runExtractionPipeline } from "@/lib/pricing/extractionEngine";

export async function POST(req: Request) {
  try {
    const { userInput } = await req.json();
    if (!userInput || typeof userInput !== "string") {
      return new Response(JSON.stringify({ error: "userInput is required" }), { status: 400 });
    }

    const extraction = await runExtractionPipeline(userInput);

    return Response.json({
      jobs: extraction.jobs,
      visits: extraction.visits,
      price: extraction.price,
      clarifiers: extraction.clarifiers,
      message: extraction.message
    });

  } catch (err: any) {
    console.error("AI Extraction Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
