import "./config/env.js";
import express from "express";
import cors from "cors";
import { PORT } from "./config/env.js";
import { connectDB } from "./config/db.js";
import uploadRoute from "./routes/upload.js";
import shareRoute from "./routes/share.js"; // 🔥 New

const app = express();

// Middleware
app.use(
  cors({
    origin: "https://splitbill.rifqinaufal11.studio",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json()); // 👈 Penting agar bisa baca JSON body

// Connect DB
connectDB();

// Routes
app.use("/api/receipt", uploadRoute);
app.use("/api/share", shareRoute); // 🔥 New

app.get("/", (req, res) => res.send("SplitBill API is running."));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
