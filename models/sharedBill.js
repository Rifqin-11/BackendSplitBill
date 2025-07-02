import mongoose from "mongoose";

const SharedBillSchema = new mongoose.Schema(
  {
    billData: { type: Object, required: true },
    people: { type: Array, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("SharedBill", SharedBillSchema);
