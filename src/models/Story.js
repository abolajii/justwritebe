const mongoose = require("mongoose");

const storySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String, // Link to the story content (image, video, text)
    },
    media: {
      url: { type: String }, // Link to the story content (image, video, text)
      type: { type: String, enum: ["image", "video", "text"] },
    },
    caption: {
      type: String,
      maxlength: 200, // Optional caption or description
    },
    views: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User", // Reference to the User who viewed the story
          required: true,
        },
        viewedAt: {
          type: Date,
          default: Date.now, // Timestamp of when the story was viewed
        },
      },
    ],
    isPublic: {
      type: Boolean,
      default: true, // Set to false for friends-only visibility
    },
    expiresAt: {
      type: Date,
      default: () => Date.now() + 24 * 60 * 60 * 1000, // Set to 24 hours from creation time
    },
  },
  {
    timestamps: true,
  }
);

// Automatically delete stories when they expire
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Story = mongoose.model("Story", storySchema);

module.exports = Story;
