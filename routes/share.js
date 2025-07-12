import express from "express";
import SharedBill from "../models/sharedBill.js";

const router = express.Router();

// POST /api/share
router.post("/", async (req, res) => {
  try {
    const { billData, people, paymentMethods } = req.body;


    console.log("📥 billData:", JSON.stringify(billData, null, 2));
    console.log("👥 people:", JSON.stringify(people, null, 2));

    if (!billData || !people) {
      return res.status(400).json({ error: "Missing billData or people" });
    }

    const shared = await SharedBill.create({
      billData,
      people,
      paymentMethods,
    });


    res.status(201).json({ id: shared._id });
  } catch (err) {
    console.error("Error in /api/share:", err);
    res.status(500).json({ error: "Failed to share bill" });
  }
});

// GET /api/share/:id
router.get("/:id", async (req, res) => {
  try {
    const shared = await SharedBill.findById(req.params.id);
    if (!shared) return res.status(404).json({ error: "Not found" });

    res.json(shared);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch shared bill" });
  }
});

export default router;
