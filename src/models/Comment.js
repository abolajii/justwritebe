// models/Comment.js
const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      maxlength: 500, // Limit to 500 characters
    },
    imageUrl: {
      type: String, // Optional image for the post
      default: null,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // User who created the comment
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true }, // The post this comment belongs to
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who liked the comment
    views: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who viewed the comment
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who bookmarked the comment
    shares: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who shared the comment
    replies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }], // Comments on the post
    originalComment: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" }, // For shared comments, reference to the original
    commentType: { type: String, default: "original" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Comment", CommentSchema);
