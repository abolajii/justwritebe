// models/TrendingWord.js
const mongoose = require("mongoose");

const SignalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    userTrade: {
      type: Boolean,
      required: false,
    },
    startingCapital: {
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
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Signal", SignalSchema);
