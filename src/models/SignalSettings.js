// models/TrendingWord.js
const mongoose = require("mongoose");

const SignalSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    calculateSignal: {
      type: Boolean,
      required: true,
    },
    whenToCalculateSignal: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserSignal", SignalSettingsSchema);
