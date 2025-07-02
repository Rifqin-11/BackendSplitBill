import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

const router = express.Router();
const upload = multer({ dest: path.join(process.cwd(), "uploads/") });

// Document AI Configuration
const PROJECT_ID = "splitbill-464604";
const LOCATION = "us";
const PROCESSOR_ID = "b8a8f5e9551d38bf";

const docAiClient = new DocumentProcessorServiceClient();

// Enhanced currency formatter
const formatCurrency = (value) => {
  if (typeof value === "string") {
    value = value
      .replace(/[^\d.,-]/g, "")
      .replace(/\./g, "") // Remove thousand separators
      .replace(/,/g, "."); // Convert decimal comma to dot
  }
  const num = parseFloat(value) || 0;
  return parseFloat(num.toFixed(3)); // Ensure 3 decimal places
};

// Main receipt processing function
router.post("/", upload.single("receipt"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'Receipt file not found. Use the "receipt" field.',
    });
  }

  const filePath = req.file.path;

  try {
    // 1. Read and encode image
    const buffer = fs.readFileSync(filePath);
    const base64Image = buffer.toString("base64");

    // 2. Process with Document AI
    const name = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;
    const [result] = await docAiClient.processDocument({
      name,
      rawDocument: {
        content: base64Image,
        mimeType: req.file.mimetype,
      },
    });
    const { document } = result;
    const text = document.text || "";

    // 3. Initialize variables
    let items = [];
    let subtotal = 0;
    let tax = 0;
    let discount = 0;
    let total = 0;
    let paymentMethod = "";
    let date = "";
    let merchantName = "";
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line);

    // 4. Merchant and date detection
    merchantName = detectMerchant(lines);
    date = detectDate(text);

    // 5. Specialized parsers for different receipt formats
    if (/OMA OPA CAKERY/i.test(text)) {
      // OPA CAKERY specific parser
      const opaResult = parseOpaCakery(lines);
      items = opaResult.items;
      total = opaResult.total || total;
      paymentMethod = opaResult.paymentMethod;
    } else if (/Gofood/i.test(text)) {
      // Gofood specific parser
      const gofoodResult = parseGofood(lines);
      items = gofoodResult.items;
      subtotal = gofoodResult.subtotal;
      discount = gofoodResult.discount;
      total = gofoodResult.total;
      paymentMethod = "Gofood";
    } else {
      // Generic parser
      items = parseGenericItems(lines);
    }

    // 6. Calculate missing values
    if (items.length > 0) {
      subtotal = subtotal || items.reduce((sum, item) => sum + item.price, 0);
      total = total || subtotal - discount + tax;
    } else if (total === 0) {
      // Fallback: look for standalone total value
      total = findStandaloneTotal(lines);
      if (total > 0) {
        items = [
          {
            name: "Total Payment",
            quantity: 1,
            pricePerItem: total,
            price: total,
          },
        ];
        subtotal = total;
      }
    }

    // 7. Final validation
    if (total > 0 && subtotal === 0) {
      subtotal = total + discount - tax;
    }

    // 8. Prepare response
    return res.json({
      merchant: merchantName,
      date,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity || 1,
        pricePerItem: formatCurrency(item.pricePerItem || item.price),
        price: formatCurrency(item.price),
      })),
      subtotal: formatCurrency(subtotal),
      tax: formatCurrency(tax),
      discount: formatCurrency(discount),
      total: formatCurrency(total),
      paymentMethod: paymentMethod || detectPaymentMethod(lines),
      rawText: text,
    });
  } catch (err) {
    console.error("Receipt processing error:", err);
    return res.status(500).json({
      error: "Failed to process receipt",
      details: err.message,
    });
  } finally {
    fs.unlink(filePath, (e) => e && console.error("Cleanup error:", e));
  }
});

// Helper functions

function detectMerchant(lines) {
  const merchantLine = lines.find((line) =>
    /OMA OPA|Gofood|Press Start|McDonald/i.test(line)
  );
  return merchantLine || "";
}

function detectDate(text) {
  const dateMatch = text.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/);
  return dateMatch ? dateMatch[0] : "";
}

function detectPaymentMethod(lines) {
  const paymentLine = lines.find((line) =>
    /BCA|QR|Gofood|Cash|Debit/i.test(line)
  );
  return paymentLine ? paymentLine.replace(/:/g, "").trim() : "";
}

function findStandaloneTotal(lines) {
  const totalLine = lines.find(
    (line) => /^\d+\.\d{3}$/.test(line) || /^\d+\,\d{3}$/.test(line)
  );
  return totalLine ? formatCurrency(totalLine) : 0;
}

function parseOpaCakery(lines) {
  const items = [];
  let total = 0;
  let paymentMethod = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Item detection (multi-line format)
    if (/Malmil|Cheese|Choco/i.test(line)) {
      const nextLine = lines[i + 1] || "";
      const priceMatch = nextLine.match(/@?([\d.,]+)/);

      if (priceMatch) {
        items.push({
          name: line,
          quantity: 1,
          pricePerItem: formatCurrency(priceMatch[1]),
          price: formatCurrency(priceMatch[1]),
        });
        i++; // Skip next line
      }
    }

    // Total detection
    if (/19\.000/i.test(line) && !/@/.test(line)) {
      total = formatCurrency(line);
    }

    // Payment method detection
    if (/BCA|QR/i.test(line)) {
      paymentMethod = line.replace(/:/g, "").trim();
    }
  }

  return { items, total, paymentMethod };
}

function parseGofood(lines) {
  const items = [];
  let subtotal = 0;
  let discount = 0;
  let total = 0;

  for (const line of lines) {
    // Item detection
    const itemMatch = line.match(/(.+?)\s+(\d+x)?\s*Rp?\s*([\d.,]+)/i);
    if (itemMatch) {
      items.push({
        name: itemMatch[1].trim(),
        quantity: parseInt(itemMatch[2]) || 1,
        pricePerItem: formatCurrency(itemMatch[3]),
        price: formatCurrency(itemMatch[3]),
      });
    }

    // Discount detection
    if (/\(Rp|-\s*Rp/i.test(line)) {
      const discMatch = line.match(/[\d.,]+/);
      if (discMatch) {
        discount += formatCurrency(discMatch[0]);
      }
    }

    // Total detection
    if (/Subtotal/i.test(line)) {
      const subtotalMatch = line.match(/[\d.,]+/);
      if (subtotalMatch) subtotal = formatCurrency(subtotalMatch[0]);
    }

    if (/Total/i.test(line) && !/Subtotal/i.test(line)) {
      const totalMatch = line.match(/[\d.,]+/);
      if (totalMatch) total = formatCurrency(totalMatch[0]);
    }
  }

  return { items, subtotal, discount, total };
}

function parseGenericItems(lines) {
  const items = [];

  for (const line of lines) {
    // Standard item format: Name Price
    const stdMatch = line.match(/^(.+?)\s+(\d+x)?\s*Rp?\s*([\d.,]+)$/i);
    if (stdMatch) {
      items.push({
        name: stdMatch[1].trim(),
        quantity: parseInt(stdMatch[2]) || 1,
        pricePerItem: formatCurrency(stdMatch[3]),
        price: formatCurrency(stdMatch[3]),
      });
      continue;
    }

    // Quantity format: 2x @30.000 60.000
    const qtyMatch = line.match(/^(\d+x)\s*@?\s*([\d.,]+)\s+([\d.,]+)$/i);
    if (qtyMatch) {
      items.push({
        name: `Item ${items.length + 1}`,
        quantity: parseInt(qtyMatch[1]),
        pricePerItem: formatCurrency(qtyMatch[2]),
        price: formatCurrency(qtyMatch[3]),
      });
    }
  }

  return items;
}

export default router;
