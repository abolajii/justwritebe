const mongoose = require("mongoose");

// Schema for storing media metadata
const mediaSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "video", "file", "audio"], // Define allowed media types
      required: true,
    },
    url: {
      type: String,
      required: true, // URL to access the media
    },
    thumbnail: {
      type: String, // Optional field for image or video thumbnail
    },
    duration: {
      type: Number, // Duration of audio or video in seconds
    },
    size: {
      type: Number, // Size of the file in bytes
    },
    name: {
      type: String, // Optional field for file or video name
    },
  },
  { _id: false } // No need for an auto-generated _id for embedded documents
);

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    content: {
      type: String, // Text content for messages
    },
    media: [mediaSchema], // Array of media objects
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
