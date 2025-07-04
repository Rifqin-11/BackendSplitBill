import fetch from "node-fetch";

export async function parseReceiptWithGemini(lines) {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable not set.");
  }

  const model = "gemini-2.5-flash-lite-preview-06-17"; // Using a modern, efficient model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

  // Di dalam file backend/utils/geminiParser.js

  const prompt = `
You are an expert receipt data extractor. Your goal is to accurately extract structured data into a clean JSON object based on the provided text.

The main challenge is to correctly identify the 'price' (total price for the line item) and 'price_per_item'. Use the patterns and examples below to make the correct decision.

Your final output MUST ONLY be the clean JSON object with this exact structure:
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

---
### LOGIC AND PATTERNS ###

You must analyze the receipt and decide which of the following patterns an item follows.

#### Pattern 1: Single Price Listed (Common in Restaurants)
In this format, only one price is listed for an item, and it represents the TOTAL PRICE for that line.

**Example Text:**
\`\`\`
5 ICE TEA JUMBO 47.500
\`\`\`
**Correct Logic:**
- The value 47.500 is the total 'price'.
- The 'price_per_item' MUST be calculated: 47.500 / 5 = 9500.
- **Correct JSON:** { "name": "ICE TEA JUMBO", "quantity": 5, "price_per_item": 9500, "price": 47500 }

---

#### Pattern 2: Two Prices Listed (Common in Supermarkets)
In this format, an item is followed by its quantity, price per item, and total price, often on multiple lines.

**Example Text:**
\`\`\`
INDOMI GORENG SPC 80
2
3200
6,400
\`\`\`
**Correct Logic:**
- There are two prices, 3200 (Price A) and 6400 (Price B).
- Check the math: quantity * Price A = 2 * 3200 = 6400, which equals Price B.
- Therefore, 'price_per_item' is Price A (3200) and 'price' is Price B (6400).
- **Correct JSON:** { "name": "INDOMI GORENG SPC 80", "quantity": 2, "price_per_item": 3200, "price": 6400 }

---

### FINAL RULE ###
For the 'subtotal', 'tax', and 'total' fields, you MUST extract the numeric value written directly next to these words on the receipt. DO NOT calculate these values by summing up items yourself.

---
### TAXATION RULE ###
**IMPORTANT:** If you find text on the subtotal line indicating that tax is already included (e.g., "Subtotal (Termasuk PPN)", "sudah termasuk pajak", "including tax", "VAT included"), you MUST set the 'tax' and 'tax_percent' fields to 0 in your JSON output. The subtotal value itself should still be extracted as is. If no such mention is made, extract the tax value as written on the receipt.

---
### RECEIPT TEXT TO PARSE ###
${lines.join("\n")}
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
