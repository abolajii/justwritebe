const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reported: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["Pending", "Reviewed"], default: "Pending" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
