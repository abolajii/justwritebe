const mongoose = require("mongoose");

const storySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    media: {
      url: { type: String, required: true }, // Link to the story content (image, video, text)
      type: { type: String, enum: ["image", "video", "text"], required: true },
    },
    caption: {
      type: String,
      maxlength: 200, // Optional caption or description
    },
    views: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Users who viewed the story
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
