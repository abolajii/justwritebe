const mongoose = require("mongoose");

const BookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Add compound index to prevent duplicate bookmarks
BookmarkSchema.index({ user: 1, post: 1, folder: 1 }, { unique: true });

module.exports = mongoose.model("Bookmark", BookmarkSchema);
