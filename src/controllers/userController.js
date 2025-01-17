const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Folder = require("../models/Folder");
const Bookmark = require("../models/Bookmark");
const { createNotification, getUserProfileAndPosts } = require("../utils");
const Notification = require("../models/Notification");
const Story = require("../models/Story");

const ImageKit = require("imagekit");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: `https://ik.imagekit.io/${process.env.IMAGEKIT_ID}`,
});

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

  const file = req.files?.profilePic;
  const backdrop = req.files?.backdrop;

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

    const username = user.username;

    // Update fields
    user.name = name || user.name;
    user.bio = bio || user.bio;
    user.link = link || user.link;
    user.location = location || user.location;

    if (file) {
      // Upload the profile picture to ImageKit
      const uploadResponse = await imagekit.upload({
        file: file.data.toString("base64"), // base64 encoded string
        fileName: `${username}_${Date.now()}`, // A unique file name
        folder: `/profile_pics/${username}`, // Optional folder path in ImageKit
      });

      // Set the profile picture URL from ImageKit's response
      user.profilePic = uploadResponse.url;
    }

    if (backdrop) {
      // Upload the profile picture to ImageKit
      const uploadResponse = await imagekit.upload({
        file: backdrop.data.toString("base64"), // base64 encoded string
        fileName: `${username}_${Date.now()}`, // A unique file name
        folder: `/backdrop/${username}`, // Optional folder path in ImageKit
      });

      // Set the profile picture URL from ImageKit's response
      user.backdrop = uploadResponse.url;
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
        backdrop: user.backdrop,
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
    const userId = req.params.userId;
    const tag = req.query.tag;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    let query = {};
    let activity = null;

    switch (tag) {
      case "posts":
        query = { user: userId };
        break;
      case "likes":
        query = { likes: userId };
        break;
      case "media":
        query = { user: userId, imageUrl: { $ne: null } };
        break;
      case "bookmarks":
        query = { bookmarks: userId };
        break;
      case "shared":
        query = { shares: userId };
        break;
      case "replies":
        activity = await Comment.find({ user: userId })
          .populate("post", "content user createdAt")
          .populate("user", "username name profilePic isVerified")
          .sort({ createdAt: -1 });
        break;
      default:
        return res.status(400).json({
          message:
            "Invalid tag. Valid tags are: posts, likes, media, replies, bookmarks, shared",
        });
    }

    if (tag !== "replies") {
      activity = await Post.find(query)
        .sort({ createdAt: -1 })
        .populate({
          path: "pollId",
          populate: {
            path: "options.votes.user",
            model: "User",
            select: "username name profilePic",
          },
        })
        .populate({
          path: "user",
          select: "username name profilePic isVerified",
        })
        .populate({
          path: "originalPost",
          populate: [
            {
              path: "user",
              model: "User",
              select: "username name profilePic isVerified",
            },
            {
              path: "pollId",
              model: "Poll",
              populate: {
                path: "options.votes.user",
                model: "User",
                select: "username name profilePic",
              },
            },
          ],
        })
        .populate({
          path: "comments",
          populate: {
            path: "user",
            model: "User",
            select: "username name profilePic isVerified",
          },
        })
        .populate({
          path: "mentions",
          select: "username name profilePic isVerified",
        });
    }

    // Format the response
    const formattedActivity = activity.map((item) => {
      const itemObj = item.toObject();

      // If it's a post with a poll, format the poll data
      if (itemObj.pollId) {
        const uniqueVoters = new Map();

        itemObj.pollId.options.forEach((option) => {
          option.votes.forEach((vote) => {
            if (vote.user) {
              uniqueVoters.set(vote.user._id.toString(), {
                _id: vote.user._id,
                username: vote.user.username,
                name: vote.user.name,
                profilePic: vote.user.profilePic,
              });
            }
          });
        });

        const allVoters = Array.from(uniqueVoters.values());

        // Format poll options
        itemObj.pollId.options = itemObj.pollId.options.map((option) => {
          const voteCount = option.votes.length;
          const hasVoted = option.votes.some(
            (vote) => vote.user && vote.user._id.toString() === userId
          );

          return {
            _id: option._id,
            optionText: option.optionText,
            voteCount,
            hasVoted,
            votePercentage:
              allVoters.length > 0
                ? ((voteCount / allVoters.length) * 100).toFixed(1)
                : "0",
            votes: option.votes
              .filter((vote) => vote.user)
              .map((vote) => ({
                _id: vote._id,
                user: {
                  _id: vote.user._id,
                  username: vote.user.username,
                  name: vote.user.name,
                  profilePic: vote.user.profilePic,
                },
              })),
          };
        });

        // Add poll metadata
        itemObj.pollId.totalVotes = {
          count: allVoters.length,
          voters: allVoters,
        };
        itemObj.pollId.hasEnded = new Date() > new Date(itemObj.pollId.endTime);
        itemObj.pollId.hasVoted = itemObj.pollId.options.some(
          (option) => option.hasVoted
        );
      }

      // If it's a post, add bookmark status
      if (tag !== "replies") {
        itemObj.isBookmarked = item.bookmarks.includes(userId);
      }

      // If there's an original post with a poll, format that poll data too
      if (itemObj.originalPost?.pollId) {
        const uniqueVoters = new Map();

        itemObj.originalPost.pollId.options.forEach((option) => {
          option.votes.forEach((vote) => {
            if (vote.user) {
              uniqueVoters.set(vote.user._id.toString(), {
                _id: vote.user._id,
                username: vote.user.username,
                name: vote.user.name,
                profilePic: vote.user.profilePic,
              });
            }
          });
        });

        const allVoters = Array.from(uniqueVoters.values());

        itemObj.originalPost.pollId.options =
          itemObj.originalPost.pollId.options.map((option) => {
            const voteCount = option.votes.length;
            const hasVoted = option.votes.some(
              (vote) => vote.user && vote.user._id.toString() === userId
            );

            return {
              _id: option._id,
              optionText: option.optionText,
              voteCount,
              hasVoted,
              votePercentage:
                allVoters.length > 0
                  ? ((voteCount / allVoters.length) * 100).toFixed(1)
                  : "0",
              votes: option.votes
                .filter((vote) => vote.user)
                .map((vote) => ({
                  _id: vote._id,
                  user: {
                    _id: vote.user._id,
                    username: vote.user.username,
                    name: vote.user.name,
                    profilePic: vote.user.profilePic,
                  },
                })),
            };
          });

        itemObj.originalPost.pollId.totalVotes = {
          count: allVoters.length,
          voters: allVoters,
        };
        itemObj.originalPost.pollId.hasEnded =
          new Date() > new Date(itemObj.originalPost.pollId.endTime);
        itemObj.originalPost.pollId.hasVoted =
          itemObj.originalPost.pollId.options.some((option) => option.hasVoted);
      }

      return itemObj;
    });

    return res.status(200).json({
      message: `${tag} activity retrieved successfully`,
      activity: formattedActivity,
    });
  } catch (error) {
    console.error("Error retrieving user activity info:", error);
    return res.status(500).json({
      message: "Error retrieving user activity info",
      error: error.message,
    });
  }
};

exports.getUserInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const tag = req.query.tag;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    let query = {};
    let activity = null;

    switch (tag) {
      case "posts":
        query = { user: userId };
        break;
      case "likes":
        query = { likes: userId };
        break;
      case "media":
        query = { user: userId, imageUrl: { $ne: null } };
        break;
      case "bookmarks":
        query = { bookmarks: userId };
        break;
      case "shared":
        query = { shares: userId };
        break;
      case "replies":
        activity = await Comment.find({ user: userId })
          .populate("post", "content user createdAt")
          .populate("user", "username name profilePic isVerified")
          .sort({ createdAt: -1 });
        break;
      default:
        return res.status(400).json({
          message:
            "Invalid tag. Valid tags are: posts, likes, media, replies, bookmarks, shared",
        });
    }

    if (tag !== "replies") {
      activity = await Post.find(query)
        .sort({ createdAt: -1 })
        .populate({
          path: "pollId",
          populate: {
            path: "options.votes.user",
            model: "User",
            select: "username name profilePic",
          },
        })
        .populate({
          path: "user",
          select: "username name profilePic isVerified",
        })
        .populate({
          path: "originalPost",
          populate: [
            {
              path: "user",
              model: "User",
              select: "username name profilePic isVerified",
            },
            {
              path: "pollId",
              model: "Poll",
              populate: {
                path: "options.votes.user",
                model: "User",
                select: "username name profilePic",
              },
            },
          ],
        })
        .populate({
          path: "comments",
          populate: {
            path: "user",
            model: "User",
            select: "username name profilePic isVerified",
          },
        })
        .populate({
          path: "mentions",
          select: "username name profilePic isVerified",
        });
    }

    // Format the response
    const formattedActivity = activity.map((item) => {
      const itemObj = item.toObject();

      // If it's a post with a poll, format the poll data
      if (itemObj.pollId) {
        const uniqueVoters = new Map();

        itemObj.pollId.options.forEach((option) => {
          option.votes.forEach((vote) => {
            if (vote.user) {
              uniqueVoters.set(vote.user._id.toString(), {
                _id: vote.user._id,
                username: vote.user.username,
                name: vote.user.name,
                profilePic: vote.user.profilePic,
              });
            }
          });
        });

        const allVoters = Array.from(uniqueVoters.values());

        // Format poll options
        itemObj.pollId.options = itemObj.pollId.options.map((option) => {
          const voteCount = option.votes.length;
          const hasVoted = option.votes.some(
            (vote) => vote.user && vote.user._id.toString() === userId
          );

          return {
            _id: option._id,
            optionText: option.optionText,
            voteCount,
            hasVoted,
            votePercentage:
              allVoters.length > 0
                ? ((voteCount / allVoters.length) * 100).toFixed(1)
                : "0",
            votes: option.votes
              .filter((vote) => vote.user)
              .map((vote) => ({
                _id: vote._id,
                user: {
                  _id: vote.user._id,
                  username: vote.user.username,
                  name: vote.user.name,
                  profilePic: vote.user.profilePic,
                },
              })),
          };
        });

        // Add poll metadata
        itemObj.pollId.totalVotes = {
          count: allVoters.length,
          voters: allVoters,
        };
        itemObj.pollId.hasEnded = new Date() > new Date(itemObj.pollId.endTime);
        itemObj.pollId.hasVoted = itemObj.pollId.options.some(
          (option) => option.hasVoted
        );
      }

      // If it's a post, add bookmark status
      if (tag !== "replies") {
        itemObj.isBookmarked = item.bookmarks.includes(userId);
      }

      // If there's an original post with a poll, format that poll data too
      if (itemObj.originalPost?.pollId) {
        const uniqueVoters = new Map();

        itemObj.originalPost.pollId.options.forEach((option) => {
          option.votes.forEach((vote) => {
            if (vote.user) {
              uniqueVoters.set(vote.user._id.toString(), {
                _id: vote.user._id,
                username: vote.user.username,
                name: vote.user.name,
                profilePic: vote.user.profilePic,
              });
            }
          });
        });

        const allVoters = Array.from(uniqueVoters.values());

        itemObj.originalPost.pollId.options =
          itemObj.originalPost.pollId.options.map((option) => {
            const voteCount = option.votes.length;
            const hasVoted = option.votes.some(
              (vote) => vote.user && vote.user._id.toString() === userId
            );

            return {
              _id: option._id,
              optionText: option.optionText,
              voteCount,
              hasVoted,
              votePercentage:
                allVoters.length > 0
                  ? ((voteCount / allVoters.length) * 100).toFixed(1)
                  : "0",
              votes: option.votes
                .filter((vote) => vote.user)
                .map((vote) => ({
                  _id: vote._id,
                  user: {
                    _id: vote.user._id,
                    username: vote.user.username,
                    name: vote.user.name,
                    profilePic: vote.user.profilePic,
                  },
                })),
            };
          });

        itemObj.originalPost.pollId.totalVotes = {
          count: allVoters.length,
          voters: allVoters,
        };
        itemObj.originalPost.pollId.hasEnded =
          new Date() > new Date(itemObj.originalPost.pollId.endTime);
        itemObj.originalPost.pollId.hasVoted =
          itemObj.originalPost.pollId.options.some((option) => option.hasVoted);
      }

      return itemObj;
    });

    return res.status(200).json({
      message: `${tag} activity retrieved successfully`,
      activity: formattedActivity,
    });
  } catch (error) {
    console.error("Error retrieving user activity info:", error);
    return res.status(500).json({
      message: "Error retrieving user activity info",
      error: error.message,
    });
  }
};

exports.createFolder = async (req, res) => {
  try {
    const { name, category } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Folder name is required",
      });
    }

    const folder = await Folder.create({
      name,
      user: userId,
      category,
      bookmarks: [],
    });

    return res.status(201).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    console.error("Error creating folder:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create folder",
    });
  }
};
exports.addPostToFolder = async (req, res) => {
  try {
    const { folderId, postId } = req.body;
    const userId = req.user.id;

    if (!folderId || !postId) {
      return res.status(400).json({
        success: false,
        message: "Folder ID and Post ID are required",
      });
    }

    // Check if folder exists and belongs to the user
    const folder = await Folder.findOne({ _id: folderId, user: userId });
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: "Folder not found or unauthorized",
      });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if the post is already bookmarked in this folder
    const existingBookmark = await Bookmark.findOne({
      user: userId,
      post: postId,
      folder: folderId,
    });

    if (existingBookmark) {
      return res.status(400).json({
        success: false,
        message: "Post already added to this folder",
      });
    }

    // Create bookmark and update references
    const session = await Folder.startSession();
    session.startTransaction();
    try {
      const bookmark = await Bookmark.create(
        [{ user: userId, post: postId, folder: folderId }],
        { session }
      );

      folder.bookmarks.push(postId);
      await folder.save({ session });

      if (!post.bookmarks.includes(userId)) {
        post.bookmarks.push(userId);
        await post.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        data: bookmark,
      });
    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }
  } catch (error) {
    console.error("Error adding post to folder:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add post to folder",
    });
  }
};

// exports.getUserBookmarks = async (req, res) => {
//   const userId = req.user.id; // Assuming user authentication middleware adds this

//   try {
//     // Fetch bookmarks for the authenticated user
//     const bookmarks = await Bookmark.find({ user: userId })
//       .populate({
//         path: "post",
//         select: "content imageUrl user", // Select desired post fields
//         populate: {
//           path: "user",
//           select: "name email", // Select desired user fields
//         },
//       })
//       .populate({
//         path: "folder",
//         select: "name", // Select desired folder fields
//       });

//     if (!bookmarks || bookmarks.length === 0) {
//       return res.status(404).json({ message: "No bookmarks found" });
//     }

//     res.status(200).json({
//       success: true,
//       data: bookmarks,
//     });
//   } catch (error) {
//     console.error("Error fetching bookmarks:", error);
//     return res.status(500).json({ message: "An error occurred", error });
//   }
// };

exports.getUserBookmarks = async (req, res) => {
  const userId = req.user.id;
  const { query } = req.query;

  try {
    let folderQuery = { user: userId };
    if (query) {
      folderQuery.name = { $regex: query, $options: "i" };
    }

    const folders = await Folder.find(folderQuery)
      .select("name createdAt category")
      .lean();

    const bookmarkQuery = { user: userId };
    if (query) {
      bookmarkQuery.$or = [
        { "post.content": { $regex: query, $options: "i" } },
        { notes: { $regex: query, $options: "i" } },
        { "post.user.name": { $regex: query, $options: "i" } },
        { "post.user.username": { $regex: query, $options: "i" } },
      ];
    }

    const bookmarks = await Bookmark.find(bookmarkQuery)
      .populate({
        path: "post",
        select:
          "content imageUrl user postType pollId originalPost likes comments shares createdAt", // Added likes, comments, shares
        populate: [
          {
            path: "user",
            select: "username name profilePic isVerified",
          },
          {
            path: "pollId",
            populate: {
              path: "options.votes.user",
              model: "User",
              select: "username name profilePic",
            },
          },
          {
            path: "originalPost",
            populate: [
              {
                path: "user",
                model: "User",
                select: "username name profilePic isVerified",
              },
              {
                path: "pollId",
                populate: {
                  path: "options.votes.user",
                  model: "User",
                  select: "username name profilePic",
                },
              },
            ],
          },
        ],
      })
      .populate({
        path: "folder",
        select: "name category",
      })
      .sort({ createdAt: -1 })
      .lean();

    const bookmarksWithoutFolder = [];
    const folderMap = new Map(
      folders.map((folder) => [
        folder._id.toString(),
        {
          ...folder,
          bookmarks: [],
        },
      ])
    );

    bookmarks.forEach((bookmark) => {
      if (bookmark.post) {
        // Add engagement metrics
        bookmark.post.engagementCounts = {
          likes: bookmark.post.likes?.length || 0,
          comments: bookmark.post.comments?.length || 0,
          shares: bookmark.post.shares?.length || 0,
        };

        // Check if user has liked the post
        bookmark.post.isLiked = bookmark.post.likes?.includes(userId) || false;

        // Remove the arrays since we only need the counts
        delete bookmark.post.likes;
        delete bookmark.post.comments;
        delete bookmark.post.shares;

        if (bookmark.post?.pollId) {
          const post = bookmark.post;
          const pollData = post.pollId;

          const uniqueVoters = new Map();
          pollData.options.forEach((option) => {
            option.votes.forEach((vote) => {
              if (vote.user) {
                uniqueVoters.set(vote.user._id.toString(), {
                  _id: vote.user._id,
                  username: vote.user.username,
                  name: vote.user.name,
                  profilePic: vote.user.profilePic,
                });
              }
            });
          });

          const allVoters = Array.from(uniqueVoters.values());

          post.pollId.options = pollData.options.map((option) => ({
            _id: option._id,
            optionText: option.optionText,
            voteCount: option.votes.length,
            hasVoted: option.votes.some(
              (vote) => vote.user && vote.user._id.toString() === userId
            ),
            votePercentage:
              allVoters.length > 0
                ? ((option.votes.length / allVoters.length) * 100).toFixed(1)
                : "0",
            votes: option.votes
              .filter((vote) => vote.user)
              .map((vote) => ({
                _id: vote._id,
                user: {
                  _id: vote.user._id,
                  username: vote.user.username,
                  name: vote.user.name,
                  profilePic: vote.user.profilePic,
                },
              })),
          }));

          post.pollId.totalVotes = {
            count: allVoters.length,
            voters: allVoters,
          };
          post.pollId.hasEnded = new Date() > new Date(pollData.endTime);
          post.pollId.hasVoted = post.pollId.options.some(
            (option) => option.hasVoted
          );
        }
      }

      if (bookmark.folder) {
        const folderId = bookmark.folder._id.toString();
        if (folderMap.has(folderId)) {
          folderMap.get(folderId).bookmarks.push(bookmark);
        }
      } else {
        bookmarksWithoutFolder.push(bookmark);
      }
    });

    const foldersWithBookmarks = Array.from(folderMap.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.status(200).json({
      success: true,
      data: {
        folders: foldersWithBookmarks,
        bookmarks: bookmarksWithoutFolder,
      },
    });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return res.status(500).json({
      message: "Error fetching bookmarks",
      error: error.message,
    });
  }
};

exports.getFolderContents = async (req, res) => {
  const userId = req.user.id;
  const folderId = req.params.fid;

  try {
    // Verify folder exists and belongs to user
    const folder = await Folder.findOne({
      _id: folderId,
      user: userId,
    }).lean();

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    // Get bookmarks in the folder
    const bookmarks = await Bookmark.find({ folder: folderId, user: userId })
      .populate({
        path: "post",
        select:
          "content imageUrl user postType pollId originalPost likes comments shares createdAt",
        populate: [
          {
            path: "user",
            select: "username name profilePic isVerified",
          },
          {
            path: "pollId",
            populate: {
              path: "options.votes.user",
              model: "User",
              select: "username name profilePic",
            },
          },
          {
            path: "originalPost",
            populate: [
              {
                path: "user",
                model: "User",
                select: "username name profilePic isVerified",
              },
              {
                path: "pollId",
                populate: {
                  path: "options.votes.user",
                  model: "User",
                  select: "username name profilePic",
                },
              },
            ],
          },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    // Process bookmarks (same logic as before for engagement metrics and polls)
    const processedBookmarks = bookmarks.map((bookmark) => {
      if (bookmark.post) {
        // Add engagement metrics
        bookmark.post.engagementCounts = {
          likes: bookmark.post.likes?.length || 0,
          comments: bookmark.post.comments?.length || 0,
          shares: bookmark.post.shares?.length || 0,
        };

        bookmark.post.isLiked = bookmark.post.likes?.includes(userId) || false;

        delete bookmark.post.likes;
        delete bookmark.post.comments;
        delete bookmark.post.shares;

        if (bookmark.post?.pollId) {
          const pollData = bookmark.post.pollId;
          const uniqueVoters = new Map();

          pollData.options.forEach((option) => {
            option.votes.forEach((vote) => {
              if (vote.user) {
                uniqueVoters.set(vote.user._id.toString(), {
                  _id: vote.user._id,
                  username: vote.user.username,
                  name: vote.user.name,
                  profilePic: vote.user.profilePic,
                });
              }
            });
          });

          const allVoters = Array.from(uniqueVoters.values());

          bookmark.post.pollId.options = pollData.options.map((option) => ({
            _id: option._id,
            optionText: option.optionText,
            voteCount: option.votes.length,
            hasVoted: option.votes.some(
              (vote) => vote.user && vote.user._id.toString() === userId
            ),
            votePercentage:
              allVoters.length > 0
                ? ((option.votes.length / allVoters.length) * 100).toFixed(1)
                : "0",
            votes: option.votes
              .filter((vote) => vote.user)
              .map((vote) => ({
                _id: vote._id,
                user: {
                  _id: vote.user._id,
                  username: vote.user.username,
                  name: vote.user.name,
                  profilePic: vote.user.profilePic,
                },
              })),
          }));

          bookmark.post.pollId.totalVotes = {
            count: allVoters.length,
            voters: allVoters,
          };
          bookmark.post.pollId.hasEnded =
            new Date() > new Date(pollData.endTime);
          bookmark.post.pollId.hasVoted = bookmark.post.pollId.options.some(
            (option) => option.hasVoted
          );
        }
      }
      return bookmark;
    });

    res.status(200).json({
      success: true,
      data: {
        folder,
        bookmarks: processedBookmarks,
      },
    });
  } catch (error) {
    console.error("Error fetching folder contents:", error);
    return res.status(500).json({
      message: "Error fetching folder contents",
      error: error.message,
    });
  }
};
