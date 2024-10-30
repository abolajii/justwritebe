// models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["mention", "like", "comment", "share", "reply", "follow"],
      required: true,
    },
    data: {
      follower: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // for "follow" notifications
      post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" }, // for post-related actions
      comment: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" }, // for comment replies
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
