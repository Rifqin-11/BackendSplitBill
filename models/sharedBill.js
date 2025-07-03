import mongoose from "mongoose";

const sharedBillSchema = new mongoose.Schema(
  {
    billData: Object,
    people: Array,
  },
  { timestamps: true }
);

export default mongoose.model("SharedBill", sharedBillSchema);
