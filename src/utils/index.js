const Notification = require("../models/Notification");
const User = require("../models/User");
const Post = require("../models/Post");

exports.createNotification = async (receiverId, type, data) => {
  try {
    // Create a new notification based on the provided data
    const notification = new Notification({
      receiver: receiverId,
      sender: data.followerId || data.userId, // Set sender based on action data
      type,
      data,
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw new Error("Failed to create notification.");
  }
};

// Function to get user details (including bio and location) and their posts
exports.getUserProfileAndPosts = async (userId) => {
  try {
    // Fetch user details including bio and location
    const user = await User.findById(userId).select(
      "username name email profilePic bio location followers following"
    ); // Including bio and location

    if (!user) {
      throw new Error("User not found");
    }

    // Fetch the posts of the user
    const posts = await Post.find({ user: userId })
      .populate("user", "username name profilePic") // Populate the 'user' field to get user info
      .populate("comments") // Optional: populate comments if needed
      .sort({ createdAt: -1 }); // Sort posts by creation time (newest first)

    return { user, posts };
  } catch (err) {
    console.error(err);
    throw new Error("Error fetching user profile and posts");
  }
};
