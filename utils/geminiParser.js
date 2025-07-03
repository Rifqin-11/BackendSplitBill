import fetch from "node-fetch";

export async function parseReceiptWithGemini(lines) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable not set.");
  }

  const model = "gemini-1.5-flash-latest"; // Using a modern, efficient model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

  const prompt = `
Extract structured data from the following receipt text.
The output must be a single, clean JSON object with no extra text or markdown formatting.
Use snake_case for all JSON keys.

**IMPORTANT RULES:**
1.  **Indonesian Tax:** Restaurant tax in Indonesia is often abbreviated as "PB1" or "PPN". OCR might misread "PB1" as "2B1" or something similar.
2.  **Logical Check:** Any line between the subtotal and total that includes a percentage (%) is almost always a tax or service charge. Discounts are usually labeled "Discount" or are negative numbers.
3.  **Calculation:** The tax and service charge are added to the subtotal. If a value is subtracted, it's a discount.

The JSON object should have this exact structure:
{
  "items": [
    {
      "name": "string",
      "quantity": "number",
      "price_per_item": "number",
      "price": "number"
    }
  ],
  "subtotal": "number",
  "discount": "number",
  "tax": "number",
  "tax_percent": "number",
  "service_charge": "number",
  "total": "number"
}

Receipt Text:
---
${lines.join("\n")}
---
`;

  // The new request body structure for generateContent
  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json", // Request JSON directly!
      temperature: 0,
      maxOutputTokens: 2048,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Gemini API error response:", errorText); // Log the detailed error
    throw new Error(`Gemini API request failed with status ${res.status}`);
  }

  const data = await res.json();

  // The new response structure is different
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error(
      "Failed to extract text from Gemini response:",
      JSON.stringify(data, null, 2)
    );
    throw new Error("Gemini returned an empty or invalid response.");
  }

  try {
    // The model should already return clean JSON because of response_mime_type
    return JSON.parse(text);
  } catch {
    console.error("Failed to parse Gemini JSON response:", text);
    throw new Error("Gemini output was not valid JSON.");
  }
}
