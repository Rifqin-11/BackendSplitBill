import "./config/env.js";
import express from "express";
import cors from "cors";
import { PORT } from "./config/env.js";
import { connectDB } from "./config/db.js";
import uploadRoute from "./routes/upload.js";
import shareRoute from "./routes/share.js"; // 🔥 New

const app = express();

const allowedOrigins = [
  "https://splitbill.rifqinaufal11.studio", // Your production frontend
  "http://localhost:3000", // Your local development frontend
];

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());

// Connect DB
connectDB();

// Routes
app.use("/api/receipt", uploadRoute);
app.use("/api/share", shareRoute); // 🔥 New

app.get("/", (req, res) => res.send("SplitBill API is running."));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
