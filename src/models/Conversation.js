const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    lastMsg: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    isGroup: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    groupName: {
      type: String,
      required: function () {
        return this.isGroup;
      },
    },
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);
