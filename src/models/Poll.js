const mongoose = require("mongoose");

const { Schema, model, Types } = mongoose;

const VoteSchema = new Schema({
  user: { type: Types.ObjectId, ref: "User", required: true },
  option: { type: Types.ObjectId, required: true },
});

const PollOptionSchema = new Schema({
  optionText: { type: String, required: true },
  votes: { type: [VoteSchema], default: [] }, // Tracks votes for this option
});

const PollSchema = new Schema({
  question: { type: String, required: true },
  options: { type: [PollOptionSchema], required: true },
  user: { type: Types.ObjectId, ref: "User", required: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date, required: true },
  isActive: { type: Boolean, default: true }, // Automatically deactivate after endTime
});

module.exports = model("Poll", PollSchema);
