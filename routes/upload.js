import express from "express";
import computerVisionClient from "../azureVisionClient.js";
import fs from "fs";
import multer from "multer";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// panggil Azure OCR
async function extractTextFromImage(filePath) {
  const stream = () => fs.createReadStream(filePath);
  const result = await computerVisionClient.readInStream(stream);
  const operation = result.operationLocation.split("/").pop();

  let resultData;
  while (true) {
    resultData = await computerVisionClient.getReadResult(operation);
    if (["succeeded", "failed"].includes(resultData.status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return resultData.analyzeResult.readResults.flatMap((page) =>
    page.lines.map((line) => line.text.trim())
  );
}

// bersihkan string menjadi angka utuh
function parseCurrency(str) {
  // hapus semua kecuali digit, lalu parseInt
  const digits = (str || "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function parseReceiptText(lines) {
  const result = {
    items: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    taxPercent: 0, // 👈
    serviceCharge: 0,
    total: 0,
  };

  // 1) Merge pass with three rules:
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i].trim();
    const nxt1 = (lines[i + 1] || "").trim();
    const nxt2 = (lines[i + 2] || "").trim();
    const nxt3 = (lines[i + 3] || "").trim();

    // (a) qty+name on this line + price next
    if (/\d+\s+\D+$/.test(curr) && /^[\d.,]+$/.test(nxt1)) {
      merged.push(`${curr} ${nxt1}`);
      i++;
      continue;
    }

    // (b) name-only + "qty price" next
    if (!/\d/.test(curr) && /^(\d+)\s+[\d.,]+$/.test(nxt1)) {
      const [qty, price] = nxt1.split(/\s+/);
      merged.push(`${qty} ${curr} ${price}`);
      i++;
      continue;
    }

    // (c) 4-line: name, "2x", "@unit", "total"
    if (
      /^\d+\s*x$/i.test(nxt1) &&
      /^@[\d.,]+$/.test(nxt2) &&
      /^[\d.,]+$/.test(nxt3)
    ) {
      const qty = nxt1.replace(/x/i, "");
      const total = nxt3;
      merged.push(`${qty} ${curr} ${total}`);
      i += 3;
      continue;
    }

    // fallback
    merged.push(curr);
  }

  // 2) Item regexes
  const itemPatterns = [
    /^(.+?)\s+(\d+)\s*x\s*Rp[\s\.]*([\d.,]+)$/i,
    /^(\d+)\s*x\s*Rp[\s\.]*([\d.,]+)\s+(.+)$/i,
    /^(\d+)\s+(.+?)\s+([\d.,]+)$/,
  ];

  // 3) Parse merged lines
  merged.forEach((line, idx) => {
    // discount
    if (/^-\s*[\d.,]+$/.test(line)) {
      result.discount += parseCurrency(line);
      return;
    }

    // try item patterns
    for (const pat of itemPatterns) {
      const m = line.match(pat);
      if (!m) continue;

      let qty, name, price;
      if (pat === itemPatterns[2]) {
        qty = parseInt(m[1], 10);
        name = m[2];
        price = parseCurrency(m[3]);
      } else if (pat === itemPatterns[0]) {
        name = m[1];
        qty = parseInt(m[2], 10);
        price = parseCurrency(m[3]);
      } else {
        qty = parseInt(m[1], 10);
        price = parseCurrency(m[2]);
        name = m[3];
      }

      result.items.push({
        name,
        quantity: qty,
        pricePerItem: Math.round(price / qty),
        price,
      });
      return;
    }

    // helper to get next-line numeric
    const seeNext = (rx) => {
      if (!rx.test(line)) return null;
      const m2 = merged[idx + 1]?.match(/[\d.,]+/);
      return m2 ? parseCurrency(m2[0]) : null;
    };

    // Subtotal
    if (/^subtotal|^total item|^total belanja/i.test(line)) {
      const v = seeNext(/^(subtotal|total item|total belanja)/i);
      if (v != null) {
        result.subtotal = v;
        return;
      }
    }
    // tax
    if (/^(PPN|pajak|tax)/i.test(line)) {
      const line1 = merged[idx + 1] || "";
      const line2 = merged[idx + 2] || "";

      const percentMatch = line1.match(/(\d{1,3})\s*%/);
      const maybePercent = !!percentMatch;

      const value = maybePercent ? parseCurrency(line2) : parseCurrency(line1);

      result.tax = value;

      if (maybePercent) {
        result.taxPercent = parseInt(percentMatch[1]);
      } else if (result.subtotal) {
        result.taxPercent = Math.round((value / result.subtotal) * 100);
      }

      return;
    }

    // Service
    if (/service/i.test(line)) {
      const v = seeNext(/service/i);
      if (v != null) {
        result.serviceCharge = v;
        return;
      }
    }
    // Final Total
    if (/^total$/i.test(line)) {
      const v = seeNext(/^total$/i);
      if (v != null) {
        result.total = v;
        return;
      }
    }
  });

  // 4) Fallback subtotal
  if (!result.subtotal) {
    result.subtotal = result.items.reduce((s, it) => s + it.price, 0);
  }

  // ✅ 5) Fallback total jika total == 0
  if (!result.total || result.total === 0) {
    result.total =
      result.subtotal + result.tax + result.serviceCharge - result.discount;
  }

  return result;
}



router.post("/", upload.single("image"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const textLines = await extractTextFromImage(filePath);
    fs.unlinkSync(filePath);

    const parsedData = parseReceiptText(textLines);
    res.json({ text: textLines, parsed: parsedData });
  } catch (error) {
    console.error("Error extracting text:", error);
    res.status(500).json({ error: "Failed to extract text" });
  }
});

export default router;
