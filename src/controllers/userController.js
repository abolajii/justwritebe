const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const { createNotification, getUserProfileAndPosts } = require("../utils");
const Notification = require("../models/Notification");
const Story = require("../models/Story");
const bcrypt = require("bcryptjs"); // To hash passwords

exports.getCurrentUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password"); // Exclude the password field

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const postCount = await Post.countDocuments({ user: decoded.id });

    // res.status(200).json(user);
    // Send user data along with post count
    res.status(200).json({ ...user._doc, postCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching user" });
  }
};

// Fetch all users except the logged-in user
exports.getAllUsers = async (req, res) => {
  const userId = req.user.id;

  try {
    const users = await User.find({
      _id: { $ne: userId }, // Exclude logged-in user using Mongoose syntax
    });
    res.status(200).json(users);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching users", error });
  }
};

// Follow a user
exports.followUser = async (req, res) => {
  const currentUserId = req.user.id; // The logged-in user's ID (Assumed you are using a middleware to get authenticated user)
  const { userId } = req.params; // The ID of the user you want to follow/unfollow

  try {
    // Find the current user and the target user
    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findOne({ username: userId });

    if (currentUserId === targetUser._id) {
      return res.status(400).json({ message: "You cannot follow yourself." });
    }

    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if the current user is already following the target user
    const isFollowing = currentUser.following.includes(targetUser._id);

    if (isFollowing) {
      // If already following, unfollow the user
      currentUser.following.pull(targetUser._id); // Remove user from following list
      targetUser.followers.pull(currentUserId); // Remove current user from the target user's followers list
      await currentUser.save();
      await targetUser.save();
      return res
        .status(200)
        .json({ message: "Successfully unfollowed the user." });
    } else {
      // If not following, follow the user
      currentUser.following.push(targetUser._id); // Add target user to following list
      targetUser.followers.push(currentUserId); // Add current user to the target user's followers list
      await currentUser.save();
      await targetUser.save();

      // Create a follow notification for the target user
      // const notify = await createNotification(targetUser._id, "follow", {
      //   followerId: currentUserId,
      // });

      const notify = await createNotification(targetUser._id, "follow", {
        followerId: currentUserId,
      });

      return res
        .status(200)
        .json({ message: "Successfully followed the user.", notify });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "An error occurred", error });
  }
};

// Controller to get unfollowed users
exports.suggestUsers = async (req, res) => {
  try {
    const userId = req.user.id; // Get the logged-in user's ID

    // Find the logged-in user and populate their following list
    const loggedInUser = await User.findById(userId).populate(
      "following",
      "_id"
    );

    if (!loggedInUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the list of user IDs that the logged-in user is following
    const followingIds = loggedInUser.following.map((user) => user._id);

    // Find users that the logged-in user is not following and exclude the logged-in user
    const suggestions = await User.find({
      _id: { $nin: [...followingIds, userId] }, // Exclude followed users and self
    })
      .select("username name profilePic followers following isVerified") // Select relevant fields
      .limit(10) // Limit to 10 suggestions
      .exec();

    // Get the post counts for the suggested users
    const postCounts = await Post.aggregate([
      {
        $match: {
          user: { $in: suggestions.map((user) => user._id) }, // Match the suggested users
        },
      },
      {
        $group: {
          _id: "$user", // Group by userId
          count: { $sum: 1 }, // Count the posts
        },
      },
    ]);

    // Create a mapping of user IDs to post counts
    const postCountMap = postCounts.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {});

    // Attach post counts to the suggestions
    const suggestionsWithPostCount = suggestions.map((user) => ({
      ...user.toObject(),
      postCount: postCountMap[user._id] || 0, // Default to 0 if no posts
    }));

    // Return the suggested users with post counts
    return res.status(200).json({
      message: "User suggestions fetched successfully",
      suggestions: suggestionsWithPostCount,
    });
  } catch (error) {
    console.error("Error fetching user suggestions:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch user suggestions" });
  }
};

exports.getSuggestions = async (req, res) => {
  const { q } = req.query;
  try {
    const users = await User.find({
      $or: [{ username: new RegExp(q, "i") }, { name: new RegExp(q, "i") }],
    }).select("username name profilePic"); // Select relevant fields

    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
};

// controllers/notificationController.js

exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id; // The ID of the logged-in user

    // Fetch notifications for the user, sorted by newest first
    const notifications = await Notification.find({
      receiver: userId,
      sender: { $ne: userId }, // Exclude notifications where the sender is the current user
    })
      .sort({ createdAt: -1 })
      .populate("sender", "profilePic username name") // Populates sender info (e.g., follower, liker)
      .populate("data.follower", "username profilePic") // Populates follower information if it's a follow notification
      .populate({
        path: "data.post", // Populates post details
        populate: {
          path: "user", // Further populate the user field within each post
          select: "username profilePic name", // Select specific fields from the user
        },
      })
      .populate("data.comment", "content"); // Populates comment details if it's a reply notification

    // Filter out notifications where the sender and receiver are the same (self-notifications)
    const filteredNotifications = notifications.filter((notification) => {
      if (
        notification.sender._id.toString() === notification.receiver.toString()
      ) {
        return false; // Don't include self-notifications
      }
      return true; // Include other notifications
    });

    // Send the filtered notifications
    res.status(200).json({ notifications: filteredNotifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      message: "An error occurred while fetching notifications",
    });
  }
};

exports.readNotification = async (req, res) => {
  const { id } = req.params; // Notification ID from URL parameters
  const userId = req.user.id; // Assuming middleware sets req.user to the logged-in user
  try {
    // Find the notification by ID and check if it belongs to the logged-in user
    const notification = await Notification.findOne({
      _id: id,
      receiver: userId,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Mark the notification as read
    notification.isRead = true;
    await notification.save();

    res
      .status(200)
      .json({ message: "Notification marked as read", notification });
  } catch (error) {
    console.error("Error reading notification:", error);
    res.status(500).json({ message: "Failed to mark notification as read" });
  }
};

exports.getSingleUser = async (req, res) => {
  const userId = req.params.id;

  try {
    // Get user details and posts
    const { user, posts } = await getUserProfileAndPosts(userId);

    return res.status(200).json({ user, posts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user profile and posts" });
  }
};

exports.globalSearch = async (req, res) => {
  try {
    const { query } = req.query; // Assume search query is passed in the request body

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query cannot be empty" });
    }

    // Use regular expressions for partial matching and case-insensitivity
    const searchRegex = new RegExp(query, "i");

    // Perform search across different collections
    const [posts, comments, users] = await Promise.all([
      Post.find({
        $or: [
          { content: { $regex: searchRegex } }, // Search in post content
          { postType: "quoted", originalPost: { $exists: true } }, // Quoted posts
          { postType: "shared", originalPost: { $exists: true } }, // Shared posts
        ],
      })
        .populate("user", "username profilePic name isVerified")
        .populate("originalPost", "content user")
        .populate("quotedPost", "content user"),

      Comment.find({
        $or: [
          { content: { $regex: searchRegex } }, // Search in comment content
          { commentType: "reply", originalComment: { $exists: true } }, // Replies
        ],
      })
        .populate("user", "username profilePic name isVerified")
        .populate("post", "content user") // Populate post content for context
        .populate({
          path: "post",
          populate: {
            path: "user",
            select: "username isVerified",
          },
        }), // Populate post content for context

      User.find({
        $or: [
          { username: { $regex: searchRegex } }, // Search in usernames
          { name: { $regex: searchRegex } }, // Search in names
          { bio: { $regex: searchRegex } }, // Search in bios
        ],
      }).select("username name profilePic bio location isVerified"),
    ]);

    // Combine all results into a single response
    res.status(200).json({
      posts,
      comments,
      users,
    });
  } catch (error) {
    console.error("Error performing global search:", error);
    res.status(500).json({
      message: "An error occurred while performing global search",
    });
  }
};

exports.getConnections = async (req, res) => {
  try {
    const { uname } = req.params;
    const loggedInUserId = req.user.id; // Assuming `req.user.id` is the logged-in user's ID

    // Find user by username and populate followers and following fields
    const user = await User.findOne({ username: uname })
      .populate({
        path: "followers",
        select: "id username followers profilePic name isVerified", // Populate followers with their follower IDs
        populate: [
          { path: "followers", select: "id name isVerified" },
          { path: "following", select: "id name isVerified" },
        ], // Get followers' follower IDs
      })
      .populate({
        path: "following",
        select: "id username followers profilePic name isVerified", // Populate followers with their follower IDs
        populate: [
          { path: "followers", select: "id name isVerified" },
          { path: "following", select: "id name isVerified" },
        ], // Get followers' follower IDs
      });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Map followers to check if logged-in user follows each of them
    const followers = user.followers.map((follower) => ({
      id: follower.id,
      username: follower.username,
      name: follower.name,
      followers: follower.followers,
      following: follower.following,
      profilePic: follower.profilePic,
      isVerified: follower.isVerified,
      isFollowingLoggedInUser: follower.following
        ? follower.following.map((f) => f.id).includes(loggedInUserId)
        : false,
      isFollowedByLoggedInUser: follower.followers
        ? follower.followers.map((f) => f.id).includes(loggedInUserId)
        : false,
    }));

    // Map following list
    const following = user.following.map((followedUser) => ({
      id: followedUser.id,
      username: followedUser.username,
      name: followedUser.name,
      followers: followedUser.followers,
      following: followedUser.following,
      profilePic: followedUser.profilePic,
      isVerified: followedUser.isVerified,
      isFollowingLoggedInUser: followedUser.following
        ? followedUser.following.map((f) => f.id).includes(loggedInUserId)
        : false,
      isFollowedByLoggedInUser: followedUser.followers
        ? followedUser.followers.map((f) => f.id).includes(loggedInUserId)
        : false,
    }));

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        profilePic: user.profilePic,
        isVerified: user.isVerified,
        followers,
        following,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMutualFollowers = async (req, res) => {
  const currentUserId = req.user.id; // Assuming the logged-in user's ID is available in req.user

  try {
    // Fetch the logged-in user's following and followers
    const currentUser = await User.findById(currentUserId)
      .select("following followers") // Only select necessary fields
      .populate("following", "username") // Populate following with usernames
      .populate("followers", "username"); // Populate followers with usernames

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Extract the IDs of the followers and the following users
    const followingIds = currentUser.following.map((user) =>
      user._id.toString()
    );
    const followersIds = currentUser.followers.map((user) =>
      user._id.toString()
    );

    // Find mutual followers (users present in both `following` and `followers` lists)
    const mutualFollowerIds = followersIds.filter((id) =>
      followingIds.includes(id)
    );

    // Populate mutual followers with user data like username and profile picture
    const mutualFollowersData = await User.find({
      _id: { $in: mutualFollowerIds },
    }).select("username profilePic name");

    res.status(200).json(mutualFollowersData);
  } catch (error) {
    console.error("Error fetching mutual followers:", error);
    res.status(500).json({ message: "Error fetching mutual followers" });
  }
};

exports.getFollowersStories = async (req, res) => {
  const userId = req.user.id; // Logged-in user ID from the request (assuming JWT auth)

  try {
    // Step 1: Get the logged-in user's data
    const user = await User.findById(userId).populate("followers"); // Assuming followers is an array of user IDs

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Step 2: Get the list of followers' IDs
    const followerIds = user.followers.map((follower) => follower._id); // Extract the follower IDs

    // Step 3: Get the stories from followers
    const stories = await Story.find({ user: { $in: followerIds } }) // Fetch stories of all followers
      .populate("user", "name username profilePic"); // Optionally populate the user details // Sort stories by latest first
    // Step 4: Group the stories by user
    const groupedStories = stories.reduce((grouped, story) => {
      const userId = story.user._id.toString();
      if (!grouped[userId]) {
        grouped[userId] = {
          user: story.user, // Store user info
          stories: [],
        };
      }
      grouped[userId].stories.push(story);
      return grouped;
    }, {});

    // Step 5: Return the grouped stories
    return res.status(200).json({
      message: "Followers' stories fetched successfully",
      stories: Object.values(groupedStories), // Return only the grouped stories as an array
    });
  } catch (error) {
    console.error("Error fetching followers' stories:", error);
    return res.status(500).json({
      message: "Error fetching followers' stories",
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  const { name, bio, location, link } = req.body;

  const userId = req.user.id;

  const file = req.files?.file;

  // Validate request body
  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update fields
    user.name = name || user.name;
    user.bio = bio || user.bio;
    user.link = link || user.link;
    user.location = location || user.location;

    if (file) {
      // Upload the profile picture to ImageKit
      const uploadResponse = await imagekit.upload({
        file: profilePic.data.toString("base64"), // base64 encoded string
        fileName: `${username}_${Date.now()}`, // A unique file name
        folder: `/profile_pics/${username}`, // Optional folder path in ImageKit
      });

      // Set the profile picture URL from ImageKit's response
      user.profilePic = uploadResponse.url;
    }
    // Save the updated user
    await user.save();

    return res.status(200).json({
      message: "User details updated successfully",
      user: {
        username: user.username,
        id: user.id,
        name: user.name,
        bio: user.bio,
        profilePic: user.profilePic,
        link: user.link,
        location: user.location,
      },
    });
  } catch (error) {
    console.error("Error updating user details:", error);
    return res.status(500).json({ message: "An error occurred", error });
  }
};

exports.getUserActivityInfo = async (req, res) => {
  try {
    const userId = req.user.id || req.params.userId; // Extract userId from request params
    const tag = req.query.tag; // Extract tag (posts, likes, media, replies, etc.) from query parameters

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    let activity = null;

    switch (tag) {
      case "posts":
        // Get all posts created by the user
        activity = await Post.find({ user: userId })
          .populate("user", "username name profilePic")
          .populate("pollId")
          // .populate("likes", "username profilePic")
          .sort({ createdAt: -1 });
        break;

      case "likes":
        // Get all posts the user liked
        activity = await Post.find({ likes: userId })
          .populate("user", "username name profilePic")
          .populate("comments", "content user createdAt")
          .sort({ createdAt: -1 });
        break;

      case "media":
        // Get all posts by the user that include images
        activity = await Post.find({
          user: userId,
          imageUrl: { $ne: null }, // Check if imageUrl exists
        })
          .populate("user", "username name profilePic")
          .sort({ createdAt: -1 });
        break;

      case "replies":
        // Get all comments made by the user
        activity = await Comment.find({ user: userId })
          .populate("post", "content user createdAt")
          .populate("user", "username name profilePic")
          .sort({ createdAt: -1 });
        break;

      case "bookmarks":
        // Get all posts bookmarked by the user
        activity = await Post.find({ bookmarks: userId })
          .populate("user", "username name profilePic")
          .sort({ createdAt: -1 });
        break;

      case "shared":
        // Get all posts shared by the user
        activity = await Post.find({ shares: userId })
          .populate("user", "username name profilePic")
          .populate("originalPost", "content user imageUrl")
          .sort({ createdAt: -1 });
        break;

      default:
        return res.status(400).json({
          message:
            "Invalid tag. Valid tags are: posts, likes, media, replies, bookmarks, shared",
        });
    }

    // Respond with activity data
    return res.status(200).json({
      message: `${tag} activity retrieved successfully`,
      activity,
    });
  } catch (error) {
    console.error("Error retrieving user activity info:", error);
    return res.status(500).json({
      message: "Error retrieving user activity info",
      error: error.message,
    });
  }
};
