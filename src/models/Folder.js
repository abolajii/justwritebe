// models/TrendingWord.js
const mongoose = require("mongoose");

const FolderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }], // Users who bookmarked the post
  },
  { timestamps: true }
);

module.exports = mongoose.model("Folder", FolderSchema);
