// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePic: { type: String }, // Optional profile picture URL
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users following this user
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users this user is following
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
