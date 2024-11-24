// models/Post.js
const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      // maxlength: 500, // Limit to 500 characters
    },
    imageUrl: {
      type: String, // Optional image for the post
      default: null,
    }, // Content of the post (optional for shared posts)
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // User who created the post

    postType: {
      type: String,
      enum: ["scheduled", "normal", "shared", "quote", "poll"],
      default: "normal",
    },
    originalPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    }, // For quoted and shared posts, this is the original post reference
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who liked the post
    views: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who viewed the post
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who bookmarked the post
    shares: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who shared the post
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who shared the post
    quotedPost: { type: mongoose.Schema.Types.ObjectId, ref: "Post" }, // Reference to a quoted post (if any)
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }], // Comments on the post
    visibility: {
      type: String,
      enum: ["public", "followers"], // Visibility: public or only followers
      default: "followers",
    },
    scheduledTime: { type: Date, default: null }, // Time when the post is scheduled to be published
    isScheduled: { type: Boolean, default: false },
    pollId: { type: mongoose.Schema.Types.ObjectId, ref: "Poll" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", PostSchema);
