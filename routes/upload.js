import express from "express";
import computerVisionClient from "../azureVisionClient.js";
import fs from "fs";
import multer from "multer";
import { parseReceiptWithGemini } from "../utils/geminiParser.js";

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

router.post("/", upload.single("image"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const textLines = await extractTextFromImage(filePath);
    fs.unlinkSync(filePath);

    // Langkah 1: Dapatkan hasil parsing awal dari Gemini
    const initialParsedData = await parseReceiptWithGemini(textLines);

    // ✅ Langkah 2: Lakukan validasi dan koreksi
    let finalData = initialParsedData;

    // Pastikan data yang dibutuhkan untuk validasi ada
    if (
      initialParsedData &&
      initialParsedData.items &&
      initialParsedData.subtotal > 0
    ) {
      // Hitung subtotal manual dari hasil parsing awal
      const manualSubtotal = initialParsedData.items.reduce(
        (sum, item) => sum + item.price,
        0
      );

      const ocrSubtotal = initialParsedData.subtotal;

      // Langkah 3: Heuristik - Jika subtotal manual jauh lebih besar, asumsi kita salah.
      // (contoh: lebih dari 50% lebih besar dari subtotal struk)
      if (manualSubtotal > ocrSubtotal * 1.5) {
        console.log(
          "Validation triggered: Re-calculating prices based on price-per-item assumption."
        );

        // Langkah 4: Lakukan koreksi
        const correctedItems = initialParsedData.items.map((item) => {
          // Anggap 'price' yang salah parsing tadi adalah 'price_per_item'
          const pricePerItem = item.price / item.quantity;

          return {
            ...item,
            price_per_item: pricePerItem,
            price: pricePerItem * item.quantity, // Hitung ulang harga total yang benar
          };
        });

        // Hitung ulang subtotal berdasarkan item yang sudah dikoreksi
        const correctedSubtotal = correctedItems.reduce(
          (sum, item) => sum + item.price,
          0
        );

        // Hitung ulang total keseluruhan
        const correctedTotal =
          correctedSubtotal +
          initialParsedData.tax +
          initialParsedData.serviceCharge -
          initialParsedData.discount;

        // Siapkan data final yang sudah dikoreksi
        finalData = {
          ...initialParsedData,
          items: correctedItems,
          subtotal: correctedSubtotal,
          total: correctedTotal,
        };
      }
    }

    // Kirim data final (bisa jadi data awal atau yang sudah dikoreksi)
    res.json({ text: textLines, parsed: finalData });
  } catch (error) {
    console.error("Error processing receipt:", error);
    res.status(500).json({ error: "Failed to process receipt" });
  }
});

export default router;
