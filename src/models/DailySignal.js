// models/TrendingWord.js
const mongoose = require("mongoose");

const DailySignalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    capital: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
    },
    reminder: {
      type: Boolean,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    prevCapital: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DailySignal", DailySignalSchema);
