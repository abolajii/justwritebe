// models/TrendingWord.js
const mongoose = require("mongoose");

const UserSignalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    startingCapital: {
      type: Number,
      required: true,
    },
    reminder: {
      type: String,
      required: true,
    },
    numberOfSignals: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserSignal", UserSignalSchema);
