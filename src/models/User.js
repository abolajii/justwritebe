// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    lastLogin: {
      type: Date,
      required: true,
    },
    country: {
      type: String,
    },
    isViewed: { type: Boolean, required: true, default: false },
    username: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    link: { type: String, required: false },
    password: { type: String, required: true },
    bio: { type: String, default: "" }, // Bio of the user
    location: { type: String, default: "" },
    isVerified: { type: Boolean, default: false },
    backdrop: { type: String }, // Optional profile picture URL
    profilePic: { type: String }, // Optional profile picture URL
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users following this user
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users this user is following
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
