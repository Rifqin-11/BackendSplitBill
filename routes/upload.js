import express from "express";
import computerVisionClient from "../azureVisionClient.js";
import fs from "fs";
import multer from "multer";
import { parseReceiptWithGemini } from "../utils/geminiParser.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// function to extract text from image using Azure Computer Vision
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

    // get the text lines from the OCR result
    const initialParsedData = await parseReceiptWithGemini(textLines);

    // validate and correct the parsed data
    let finalData = initialParsedData;

    // is there a subtotal in the initial parsed data?
    if (
      initialParsedData &&
      initialParsedData.items &&
      initialParsedData.subtotal > 0
    ) {
      // calculate manual subtotal from items
      const manualSubtotal = initialParsedData.items.reduce(
        (sum, item) => sum + item.price,
        0
      );

      const ocrSubtotal = initialParsedData.subtotal;

      // if manual subtotal is significantly different from OCR subtotal
      // (e.g., more than 50% difference), we assume a parsing error
      if (manualSubtotal > ocrSubtotal * 1.5) {
        console.log(
          "Validation triggered: Re-calculating prices based on price-per-item assumption."
        );

        // correct the items based on the assumption that 'price' is actually 'price_per_item'
        const correctedItems = initialParsedData.items.map((item) => {
          // if price_per_item is not defined, calculate it
          const pricePerItem = item.price / item.quantity;

          return {
            ...item,
            price_per_item: pricePerItem,
            price: pricePerItem * item.quantity, // calculate total price based on quantity
          };
        });

        // calculate the corrected subtotal
        const correctedSubtotal = correctedItems.reduce(
          (sum, item) => sum + item.price,
          0
        );

        // calculate the corrected total
        const correctedTotal =
          correctedSubtotal +
          initialParsedData.tax +
          initialParsedData.serviceCharge -
          initialParsedData.discount;

        // update final data with corrected values
        finalData = {
          ...initialParsedData,
          items: correctedItems,
          subtotal: correctedSubtotal,
          total: correctedTotal,
        };
      }
    }

    // share the final parsed data
    res.json({ text: textLines, parsed: finalData });
  } catch (error) {
    console.error("Error processing receipt:", error);
    res.status(500).json({ error: "Failed to process receipt" });
  }
});

export default router;
