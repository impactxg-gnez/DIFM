import OpenAI from "openai";
import { excelSource } from "@/lib/pricing/excelLoader";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function loadJobItems() {
  return Array.from(excelSource.jobItems.values());
}

export async function POST(req: Request) {
  const { userInput } = await req.json();

  const jobItems = loadJobItems(); // from Excel
  const jobIds = jobItems.map(j => j.job_item_id);

  const prompt = `
You are a structured job extractor.

Available canonical_job_item_id values:
${jobIds.join(", ")}

Rules:
- Return ONLY valid job_item_id from the list.
- Return multiple if applicable.
- Do NOT invent new IDs.
- If unclear, return empty array.

User input:
"${userInput}"

Return JSON format:
{
  "detected_jobs": ["job_id_1","job_id_2"]
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: "You extract structured job IDs." },
      { role: "user", content: prompt }
    ]
  });

  const text = completion.choices[0].message.content;
  return Response.json(JSON.parse(text!));
}
