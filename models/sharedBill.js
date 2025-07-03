import mongoose from "mongoose";

const sharedBillSchema = new mongoose.Schema(
  {
    billData: Object,
    people: Array,
  },
  {
    timestamps: true,
  }
);

sharedBillSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 }
);

export default mongoose.model("SharedBill", sharedBillSchema);
