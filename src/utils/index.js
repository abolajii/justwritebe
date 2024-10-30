const Notification = require("../models/Notification");

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
