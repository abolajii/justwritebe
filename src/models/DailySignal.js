// models/TrendingWord.js
const mongoose = require("mongoose");

const DailySignalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    // userTrade: {
    //   type: Boolean,
    //   required: false,
    // },
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
    prevProfit: {
      type: String,
      required: true,
    },
    profit: {
      type: String,
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
