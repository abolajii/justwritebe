// models/TrendingWord.js
const mongoose = require("mongoose");

const TrendingWordSchema = new mongoose.Schema(
  {
    word: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TrendingWord", TrendingWordSchema);
