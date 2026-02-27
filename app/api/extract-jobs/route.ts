import OpenAI from "openai";
import { excelSource } from "@/lib/pricing/excelLoader";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function loadJobItems() {
  return Array.from(excelSource.jobItems.values());
}

export async function POST(req: Request) {
  try {
    const { userInput } = await req.json();

    const jobItems = loadJobItems();
    const jobIds = jobItems.map(j => j.job_item_id);

    console.log("Allowed Job IDs:", jobIds);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "job_extraction",
          schema: {
            type: "object",
            properties: {
              detected_jobs: {
                type: "array",
                items: {
                  type: "string",
                  enum: jobIds
                }
              }
            },
            required: ["detected_jobs"]
          }
        }
      },
      messages: [
        {
          role: "system",
          content: "Extract valid job IDs only."
        },
        {
          role: "user",
          content: `
User request:
"${userInput}"

Return matching job_item_id from allowed list.
`
        }
      ]
    });

    return Response.json(
      JSON.parse(completion.choices[0].message.content!)
    );

  } catch (err: any) {
    console.error("AI Extraction Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
