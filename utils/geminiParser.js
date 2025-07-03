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

**VERY IMPORTANT RULES:**
1.  **Quantity Calculation Logic:** For any item where the quantity is greater than 1, the price shown on the receipt line is the TOTAL PRICE. You MUST calculate the 'price_per_item' by dividing this total price by the quantity. The 'price' field in the JSON should be this total price from the receipt.
2.  **EXTRACT, DO NOT CALCULATE:** For the 'subtotal', 'tax', and 'total' fields, you MUST extract the numeric value written directly next to these exact words on the receipt. DO NOT calculate these values by summing up items yourself. Extract the explicit values only.
3.  **Indonesian Tax:** Restaurant tax in Indonesia is often abbreviated as "PB1" or "PPN". OCR might misread "PB1".

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
