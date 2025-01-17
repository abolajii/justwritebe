const fs = require("fs");
const path = require("path");
const User = require("../models/User");
const Post = require("../models/Post");
const Poll = require("../models/Poll");
const Comment = require("../models/Comment");
const TrendingWord = require("../models/TrendingWord");
const { createNotification } = require("../utils");

const ImageKit = require("imagekit");
const Bookmark = require("../models/Bookmark");
const Folder = require("../models/Folder");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: `https://ik.imagekit.io/${process.env.IMAGEKIT_ID}`,
});

// Helper function to update trending word count
const updateTrendingWords = async (text) => {
  // Normalize the text (case insensitive)
  const words = text.split(/\s+/);

  for (let word of words) {
    // Check if the word is already trending for today
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)); // Start of the day

    let trendingWord = await TrendingWord.findOne({
      word: word,
      date: { $gte: startOfDay },
    });

    // If the word is already trending, increase its count
    if (trendingWord) {
      trendingWord.count += 1;
    } else {
      // Otherwise, create a new trending word entry
      trendingWord = new TrendingWord({ word, count: 1 });
    }

    // Save the updated or new trending word
    await trendingWord.save();
  }
};

// Creating a normal post
exports.createPost = async (req, res) => {
  const { content, mention } = req.body;
  const userId = req.user.id;

  // Find mentioned users by username
  const mentionedUsers = Array.isArray(mention)
    ? await User.find({ username: { $in: mention } })
    : await User.find({ username: mention });

  // Create a new post with the content and mentioned users
  const post = await Post.create({
    content,
    postType: "normal",
    user: userId,
    mentions: mentionedUsers.map((user) => user._id), // Store user IDs
  });

  // Notify each mentioned user
  for (const user of mentionedUsers) {
    await createNotification(user._id, "mention", {
      userId,
      post: post._id,
    });
  }

  try {
    if (req.files && req.files.imagePost) {
      const uploadResponse = await imagekit.upload({
        file: req.files.imagePost.data.toString("base64"), // base64 encoded string
        fileName: `${post._id}_${Date.now()}`, // A unique file name
        folder: `/posts/${post._id}`, // Optional folder path in ImageKit
      });
      //     // Set the imageUrl to the path where the image is accessible
      post.imageUrl = uploadResponse.url;
    }
    // await updateTrendingWords(content);
    await post.save();

    // Populate the fields according to the structure you specified
    const populatedPost = await Post.findById(post._id)
      .populate("user originalPost")
      .populate({
        path: "originalPost",
        populate: [
          { path: "user", model: "User" },
          {
            path: "comments",
            populate: { path: "user", model: "User" },
          },
          {
            path: "originalPost",
            populate: [
              { path: "user", model: "User" },
              {
                path: "comments",
                populate: { path: "user", model: "User" },
              },
            ],
          },
        ],
      })
      .populate({
        path: "comments",
        populate: { path: "user", model: "User" },
      })
      .populate("mentions");

    res.status(201).json(populatedPost);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creating post", error });
  }
};

// Quoting a post
exports.quotePost = async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body; // Content for the quoted post
  const userId = req.user.id;

  try {
    const originalPost = await Post.findById(postId);
    if (!originalPost)
      return res.status(404).json({ message: "Post not found" });

    const quotedPost = new Post({
      content,
      user: userId,
      postType: "quoted",
      originalPost: postId, // Reference to the original post
    });

    if (req.files && req.files.quoteUpload) {
      // Get the current date for the folder structure
      const currentDate = new Date();

      const formattedDate = `${currentDate.getFullYear()}-${(
        currentDate.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}-${currentDate
        .getDate()
        .toString()
        .padStart(2, "0")}`;

      // Generate the upload path based on the current date and post ID
      const uploadDir = path.join(
        __dirname,
        `../uploads/posts/${quotedPost._id}`,
        formattedDate
      );

      // Create the directory if it does not exist
      fs.mkdirSync(uploadDir, { recursive: true });

      const uploadedFile = req.files.quoteUpload;
      const filePath = path.join(uploadDir, uploadedFile.name);

      // Move the uploaded file to the desired directory
      await uploadedFile.mv(filePath);

      // Set the imageUrl to the path where the image is accessible
      quotedPost.imageUrl = `/uploads/posts/${quotedPost._id}/${formattedDate}/${uploadedFile.name}`;
    }
    // await updateTrendingWords(content);
    await quotedPost.save();

    // Populate the fields according to the structure you specified
    const populatedPost = await Post.findById(quotedPost._id)
      .populate("user originalPost")
      .populate({
        path: "originalPost",
        populate: [
          { path: "user", model: "User" },
          {
            path: "comments",
            populate: { path: "user", model: "User" },
          },
          {
            path: "originalPost",
            populate: [
              { path: "user", model: "User" },
              {
                path: "comments",
                populate: { path: "user", model: "User" },
              },
            ],
          },
        ],
      })
      .populate({
        path: "comments",
        populate: { path: "user", model: "User" },
      })
      .populate("mentions");

    res.status(201).json(populatedPost);
  } catch (error) {
    res.status(500).json({ message: "Error quoting post", error });
  }
};

// Sharing a post
exports.sharePost = async (req, res) => {
  const { postId } = req.params;
  const userId = req.user.id;

  try {
    const originalPost = await Post.findById(postId);

    if (!originalPost) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if the user has already shared the post
    const hasShared = originalPost.shares.includes(userId);

    if (hasShared) {
      // Unshare: Remove the user from the shares array
      originalPost.shares = originalPost.shares.filter(
        (id) => id.toString() !== userId
      );

      // Optional: Delete the shared post if needed
      await Post.deleteOne({
        userId,
        postType: "shared",
        originalPost: postId,
      });

      // Update the share count based on the new length of the shares array
      originalPost.shareCount = originalPost.shares.length;

      await originalPost.save();
      return res.status(200).json({ message: "Post unshared successfully" });
    } else {
      // Share: Add the user to the shares array
      originalPost.shares.push(userId);

      // Update the share count based on the new length of the shares array
      originalPost.shareCount = originalPost.shares.length;

      // Create a new post for the shared post
      const sharedPost = new Post({
        content: `Shared: ${originalPost.content}`,
        user: userId,
        postType: "shared",
        originalPost: postId,
      });

      await sharedPost.save();
      await originalPost.save();

      await createNotification(originalPost.user, "share", {
        userId,
        post: originalPost._id,
      });

      // Populate the fields according to the structure you specified
      const populatedPost = await Post.findById(sharedPost._id)
        .populate("user originalPost")
        .populate({
          path: "originalPost",
          populate: [
            { path: "user", model: "User" },
            {
              path: "comments",
              populate: { path: "user", model: "User" },
            },
            {
              path: "originalPost",
              populate: [
                { path: "user", model: "User" },
                {
                  path: "comments",
                  populate: { path: "user", model: "User" },
                },
              ],
            },
          ],
        })
        .populate({
          path: "comments",
          populate: { path: "user", model: "User" },
        })
        .populate("mentions");

      res.status(201).json(populatedPost);
    }
  } catch (error) {
    res.status(500).json({ message: "Error sharing post", error });
  }
};

exports.replyToPost = async (req, res) => {
  const { postId } = req.params; // Post ID to reply to
  const { content } = req.body; // Content of the comment
  const userId = req.user.id; // Logged-in user's ID

  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = new Comment({
      content,
      user: userId,
      post: postId,
    });

    if (req.files && req.files.replyUpload) {
      // Get the current date for the folder structure
      const currentDate = new Date();

      const formattedDate = `${currentDate.getFullYear()}-${(
        currentDate.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}-${currentDate
        .getDate()
        .toString()
        .padStart(2, "0")}`;

      // Generate the upload path based on the current date and post ID
      const uploadDir = path.join(
        __dirname,
        `../uploads/posts/${comment._id}`,
        formattedDate
      );

      // Create the directory if it does not exist
      fs.mkdirSync(uploadDir, { recursive: true });

      const uploadedFile = req.files.replyUpload;
      const filePath = path.join(uploadDir, uploadedFile.name);

      // Move the uploaded file to the desired directory
      await uploadedFile.mv(filePath);

      // Set the imageUrl to the path where the image is accessible
      comment.imageUrl = `/uploads/posts/${comment._id}/${formattedDate}/${uploadedFile.name}`;
    }

    await comment.save();
    // await updateTrendingWords(content);

    // Add comment to post's comment list
    post.comments.push(comment._id);
    await post.save();

    // await createNotification(post.user, "comment", {
    //   userId,
    //   post: post._id,
    //   comment: comment._id,
    // });

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Error replying to post", error });
  }
};

exports.replyToComment = async (req, res) => {
  const { commentId } = req.params; // Comment ID to reply to
  const { content } = req.body; // Content of the reply
  const userId = req.user.id; // Logged-in user's ID

  try {
    // Find the original comment
    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Create a new reply comment
    const replyComment = new Comment({
      content,
      user: userId,
      parentComment: commentId, // This links the reply to the parent comment
      post: parentComment.post, // Link the reply to the same post
    });

    // Handle file upload if provided
    if (req.files && req.files.replyUpload) {
      // Get the current date for the folder structure
      const currentDate = new Date();

      const formattedDate = `${currentDate.getFullYear()}-${(
        currentDate.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}-${currentDate
        .getDate()
        .toString()
        .padStart(2, "0")}`;

      // Generate the upload path based on the current date and comment ID
      const uploadDir = path.join(
        __dirname,
        `../uploads/comments/${replyComment._id}`,
        formattedDate
      );

      // Create the directory if it does not exist
      fs.mkdirSync(uploadDir, { recursive: true });

      const uploadedFile = req.files.replyUpload;
      const filePath = path.join(uploadDir, uploadedFile.name);

      // Move the uploaded file to the desired directory
      await uploadedFile.mv(filePath);

      // Set the imageUrl to the path where the image is accessible
      replyComment.imageUrl = `/uploads/comments/${replyComment._id}/${formattedDate}/${uploadedFile.name}`;
    }

    // Save the reply comment
    await replyComment.save();

    // Update trending words (if applicable)
    // await updateTrendingWords(content);

    // Add the reply to the original comment's replies array
    parentComment.replies.push(replyComment._id);
    await parentComment.save();

    await createNotification(parentComment.user, "comment", {
      userId,
      comment: parentComment._id,
    });

    res.status(201).json(replyComment);
  } catch (error) {
    console.error("Error replying to comment:", error);
    res.status(500).json({ message: "Error replying to comment", error });
  }
};
// Create Comment on Post
exports.createComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = new Comment({
      content: req.body.content,
      user: req.user.id,
      post: req.params.postId,
    });

    await comment.save();
    post.comments.push(comment._id);
    await post.save();
    // await updateTrendingWords(req.body.content);

    await createNotification(post.user, "reply", {
      userId: req.user.id,
      post: post._id,
      comment: comment._id,
    });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.shareComment = async (req, res) => {
  const { commentId } = req.params;
  const user = req.user.id;

  try {
    const originalComment = await Comment.findById(commentId);

    if (!originalComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Check if the user has already shared the comment
    const hasShared = originalComment.sharedBy.includes(user);

    if (hasShared) {
      // Unshare: Remove the user from the sharedBy array
      originalComment.sharedBy = originalComment.sharedBy.filter(
        (id) => id.toString() !== user
      );

      // Optional: Delete the shared comment if needed
      await Comment.deleteOne({
        user,
        commentType: "shared",
        originalComment: commentId,
      });

      await originalComment.save();
      return res.status(200).json({ message: "Comment unshared successfully" });
    } else {
      // Share: Add the user to the sharedBy array
      originalComment.sharedBy.push(user);

      // Create a new comment for the shared comment
      const sharedComment = new Comment({
        content: `Shared comment: ${originalComment.content}`,
        user,
        commentType: "shared",
        originalComment: commentId, // Reference to the original comment
      });

      await sharedComment.save();
      await originalComment.save();

      return res.status(201).json(sharedComment);
    }
  } catch (error) {
    res.status(500).json({ message: "Error sharing comment", error });
  }
};

// Get user feeds
exports.getFeeds = async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const skip = (page - 1) * pageSize;

  try {
    const user = await User.findById(userId).populate("following");
    const followedUsers = user.following.map((f) => f._id);

    const baseQuery = {
      $or: [
        { user: { $in: followedUsers }, visibility: "followers" },
        { user: userId },
      ],
      postType: { $in: ["normal", "quoted", "shared", "poll"] },
    };

    const totalPosts = await Post.countDocuments(baseQuery);

    // First get all posts
    const posts = await Post.find(baseQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
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
            path: "comments",
            populate: {
              path: "user",
              model: "User",
              select: "username name profilePic isVerified",
            },
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
                path: "comments",
                populate: {
                  path: "user",
                  model: "User",
                  select: "username name profilePic isVerified",
                },
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

    // Get all bookmarks for this user for the returned posts
    const bookmarks = await Bookmark.find({
      user: userId,
      post: { $in: posts.map((post) => post._id) },
    }).select("post folder");

    // Create a Set of bookmarked post IDs for efficient lookup
    const bookmarkedPostIds = new Set(bookmarks.map((b) => b.post.toString()));

    const processedPosts = posts.map((post) => {
      const postObj = post.toObject();

      // Check if post is bookmarked using the Set
      postObj.isBookmarked = bookmarkedPostIds.has(post._id.toString());

      // Optionally, add bookmark details if needed
      const postBookmarks = bookmarks.filter(
        (b) => b.post.toString() === post._id.toString()
      );
      if (postBookmarks.length > 0) {
        postObj.bookmarkDetails = postBookmarks.map((b) => ({
          folderId: b.folder,
          bookmarkId: b._id,
        }));
      }

      // Process poll data if exists
      if (post.pollId) {
        // Get unique voters across all options
        const uniqueVoters = new Map();

        post.pollId.options.forEach((option) => {
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

        // Convert voters map to array
        const allVoters = Array.from(uniqueVoters.values());

        // Process each option
        postObj.pollId.options = post.pollId.options.map((option) => {
          const optionObj = option.toObject();
          const voteCount = option.votes.length;
          const hasVoted = option.votes.some(
            (vote) => vote.user && vote.user._id.toString() === userId
          );

          return {
            _id: optionObj._id,
            optionText: optionObj.optionText,
            voteCount,
            hasVoted,
            votePercentage:
              allVoters.length > 0
                ? ((voteCount / allVoters.length) * 100).toFixed(1)
                : "0",
            votes: optionObj.votes
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

        postObj.pollId.totalVotes = {
          count: allVoters.length,
          voters: allVoters,
        };
        postObj.pollId.hasEnded = new Date() > new Date(post.pollId.endTime);
        postObj.pollId.hasVoted = postObj.pollId.options.some(
          (option) => option.hasVoted
        );
      }

      return postObj;
    });

    const totalPages = Math.ceil(totalPosts / pageSize);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      posts: processedPosts,
      pagination: {
        currentPage: page,
        pageSize,
        totalPosts,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Error fetching feed:", error);
    res
      .status(500)
      .json({ message: "Error fetching feed", error: error.message });
  }
};
// Controller to like or unlike a post
exports.toggleLikePost = async (req, res) => {
  const { postId } = req.params; // Post ID from URL parameters
  const userId = req.user.id; // Assuming middleware sets req.user to the logged-in user

  try {
    // Find the post by ID
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if the user has already liked the post
    const alreadyLiked = post.likes.includes(userId);
    const currentUser = await User.findById(userId);

    if (alreadyLiked) {
      // If already liked, unlike the post (remove the user from likes array)
      post.likes.pull(userId);
      await post.save();
      return res.status(200).json({ message: "Post unliked", post });
    } else {
      // If not liked, like the post (add the user to likes array)
      post.likes.push(userId);
      await post.save();

      // Only create a notification if the user liking the post is not the post owner
      if (post.user.toString() !== userId) {
        const notify = await createNotification(post.user, "like", {
          userId: currentUser._id,
          message: `${currentUser.name} liked your post`,
          post: post._id,
        });
        return res.status(200).json({ message: "Post liked", post, notify });
      } else {
        return res.status(200).json({ message: "Post liked", post });
      }
    }
  } catch (error) {
    console.error("Error liking/unliking post:", error);
    return res.status(500).json({ message: "Failed to like/unlike post" });
  }
};

exports.getTrendingWords = async (req, res) => {
  try {
    const trendingWords = await TrendingWord.find()
      .sort({ count: -1 })
      .limit(6); // Get top 10 trending words
    return res.status(200).json({ trendingWords });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.handleBookMark = async (req, res) => {
  const userId = req.user.id; // Assuming user authentication middleware adds this
  const { postId } = req.params;

  try {
    // Find the post by ID
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if the user has already bookmarked this post
    const existingBookmark = await Bookmark.findOne({
      user: userId,
      post: postId,
    });

    if (existingBookmark) {
      // If bookmark exists, delete it
      await Bookmark.findByIdAndDelete(existingBookmark._id);

      // Remove bookmark reference from post
      post.bookmarks.pull(existingBookmark._id);
      await post.save();

      return res
        .status(200)
        .json({ message: "Post unbookmarked successfully" });
    } else {
      // If bookmark does not exist, create a new one
      const newBookmark = await Bookmark.create({
        user: userId,
        post: postId,
      });

      // Add the new bookmark to the post's bookmarks array
      post.bookmarks.push(newBookmark._id);
      await post.save();

      return res
        .status(200)
        .json({ message: "Post bookmarked successfully", data: newBookmark });
    }
  } catch (error) {
    console.error("Error bookmarking/unbookmarking post:", error);
    return res.status(500).json({ message: "An error occurred", error });
  }
};

exports.getPostById = async (req, res) => {
  const { postId } = req.params;

  try {
    const post = await Post.findById(postId)
      .populate({
        path: "user", // Get the user who created the post
        select: "name email profilePic username isVerified", // Select the fields you want from the user
      })
      .populate({
        path: "comments", // Populate the comments on the post
        populate: [
          {
            path: "user", // Get the user who created each comment
            select: "name email profilePic username isVerified", // Select fields you want from the user
          },
          {
            path: "replies", // Populate replies for each comment
            populate: {
              path: "user", // Get the user for each reply
              select: "name email profilePic username isVerified", // Select fields you want from the user
            },
          },
        ],
      })
      // .populate({
      //   path: "originalPost", // Populate the original post for shared posts
      //   populate: [
      //     {
      //       path: "user", // Get the user who created the original post
      //       select: "name email profilePic username", // Select fields you want from the user
      //     },
      //     {
      //       path: "comments", // Populate comments of the original post
      //       populate: [
      //         {
      //           path: "user", // Get the user who created each comment on the original post
      //           select: "name email profilePic username", // Select fields you want from the user
      //         },
      //         {
      //           path: "replies", // Populate replies for each comment of the original post
      //           populate: {
      //             path: "user", // Get the user for each reply
      //             select: "name email profilePic username", // Select fields you want from the user
      //           },
      //         },
      //       ],
      //     },
      //   ],
      // })

      .populate({
        path: "originalPost", // Populate the original post for shared posts
        populate: [
          {
            path: "user", // Get the user who created the original post
            select: "name email profilePic username",
          },
          {
            path: "comments", // Populate comments of the original post
            populate: [
              {
                path: "user", // Get the user who created each comment on the original post
                select: "name email profilePic username",
              },
              {
                path: "replies", // Populate replies for each comment of the original post
                populate: {
                  path: "user",
                  select: "name email profilePic username",
                },
              },
            ],
          },
          {
            path: "originalPost", // Populate the deeper original post if available
            populate: {
              path: "user", // Get the user who created the deeper original post
              select: "name email profilePic username",
            },
          },
        ],
      })
      .exec(); // Execute the query

    if (!post) {
      return res.status(404).json({ message: "Post not found" }); // Return a 404 error if post is not found
    }

    res.status(200).json(post); // Send the post data as a JSON response
  } catch (error) {
    console.error("Error fetching post:", error);
    res
      .status(500)
      .json({ message: "An error occurred while fetching the post" }); // Send a 500 error response in case of a server error
  }
};

exports.schedulePost = async (req, res) => {
  const { content, scheduledTime, visibility } = req.body;

  try {
    const newPost = await Post.create({
      content,
      user: req.user.id,
      scheduledTime,
      isScheduled: true,
      visibility,
    });

    if (req.files && req.files.imagePost) {
      const uploadResponse = await imagekit.upload({
        file: req.files.imagePost.data.toString("base64"), // base64 encoded string
        fileName: `${newPost._id}_${Date.now()}`, // A unique file name
        folder: `/posts/${newPost._id}`, // Optional folder path in ImageKit
      });
      //     // Set the imageUrl to the path where the image is accessible
      newPost.imageUrl = uploadResponse.url;
    }

    res.status(201).json(newPost);
  } catch (error) {
    res.status(500).json({ message: "Error creating scheduled post", error });
  }
};

// Function to process all posts and update trending words
const processPostsForTrendingWords = async () => {
  try {
    const posts = await Post.find(); // Fetch all posts
    const wordCount = {};

    // Loop through each post and count the words
    posts.forEach((post) => {
      const words = post.content.split(/\s+/); // Split post content into words
      words.forEach((word) => {
        const trimmedWord = word.trim(); // Trim whitespace

        if (trimmedWord) {
          if (wordCount[trimmedWord]) {
            wordCount[trimmedWord] += 1; // Increment count if the word exists
          } else {
            wordCount[trimmedWord] = 1; // Initialize count if the word does not exist
          }
        }
      });
    });

    // Save or update words in the TrendingWord collection
    for (const word in wordCount) {
      await TrendingWord.findOneAndUpdate(
        { word: word },
        { $inc: { count: wordCount[word] } }, // Increment the count
        { upsert: true } // Create if it doesn't exist
      );
    }

    // console.log("Done");

    return "Trending words updated successfully!";
  } catch (error) {
    console.error("Error processing posts for trending words:", error);
    // throw new Error("Failed to process posts");
  }
};

exports.createVote = async (req, res) => {
  const user = req.user.id;
  try {
    const { question, options, startTime, endTime } = req.body;

    if (!question || !options || options.length < 2) {
      return res.status(400).json({
        message: "A poll must have a question and at least 2 options.",
      });
    }

    const pollOptions = options.map((option) => ({ optionText: option }));
    const poll = await Poll.create({
      question,
      options: pollOptions,
      startTime,
      endTime,
      user,
    });

    const post = await Post.create({
      postType: "poll",
      pollId: poll._id,
      user,
    });

    res.status(201).json({ poll, post });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to create poll." });
  }
};

exports.votePoll = async (req, res) => {
  try {
    const { pollId, optionId } = req.body;
    const userId = req.user.id;

    // Find poll and populate user details for votes
    const poll = await Poll.findById(pollId).populate({
      path: "options.votes.user",
      select: "username name profilePic",
    });

    if (!poll) {
      return res.status(404).json({ message: "Poll not found." });
    }

    // Check if poll is active
    if (poll.endTime < new Date()) {
      return res.status(400).json({ message: "Poll has ended." });
    }

    // Find user's current vote if any
    let currentVotedOption = null;
    let currentVoteId = null;

    poll.options.forEach((option) => {
      const existingVote = option.votes.find(
        (vote) => vote.user._id.toString() === userId
      );
      if (existingVote) {
        currentVotedOption = option._id.toString();
        currentVoteId = existingVote._id;
      }
    });

    // Get the target option user wants to vote for
    const targetOption = poll.options.id(optionId);
    if (!targetOption) {
      return res.status(404).json({ message: "Option not found." });
    }

    // Case 1: User is clicking the same option they voted for - remove their vote
    if (currentVotedOption === optionId) {
      targetOption.votes = targetOption.votes.filter(
        (vote) => vote.user._id.toString() !== userId
      );
    } else {
      // Case 2: User had voted for a different option - remove old vote
      if (currentVotedOption) {
        const oldOption = poll.options.id(currentVotedOption);
        oldOption.votes = oldOption.votes.filter(
          (vote) => vote.user._id.toString() !== userId
        );
      }

      // Case 3: Add new vote (applies to both new votes and vote changes)
      const user = await User.findById(userId).select(
        "username name profilePic"
      );
      targetOption.votes.push({
        user: user,
        option: optionId,
      });
    }

    await poll.save();

    // Format the response
    const pollObj = poll.toObject();

    // Get unique voters across all options
    const uniqueVoters = new Map();

    pollObj.options.forEach((option) => {
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

    // Convert voters map to array
    const allVoters = Array.from(uniqueVoters.values());

    // Process each option
    const formattedOptions = pollObj.options.map((option) => {
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

    // Create formatted response
    const formattedPoll = {
      _id: pollObj._id,
      question: pollObj.question,
      user: pollObj.user,
      startTime: pollObj.startTime,
      endTime: pollObj.endTime,
      isActive: pollObj.isActive,
      options: formattedOptions,
      totalVotes: {
        count: allVoters.length,
        voters: allVoters,
      },
      hasEnded: new Date() > new Date(pollObj.endTime),
      hasVoted: formattedOptions.some((option) => option.hasVoted),
    };

    let action = "added";
    if (currentVotedOption === optionId) {
      action = "removed";
    } else if (currentVotedOption) {
      action = "changed";
    }

    return res.status(200).json({
      message:
        action === "removed"
          ? "Vote removed successfully."
          : action === "changed"
          ? "Vote changed successfully."
          : "Vote recorded successfully.",
      poll: formattedPoll,
      action,
    });
  } catch (error) {
    console.error("Vote error:", error);
    res.status(500).json({ message: "Failed to process vote." });
  }
};
// Delete a post
exports.deletePost = async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;

  try {
    // Find and verify the post belongs to the user
    const post = await Post.findOne({ _id: postId, user: userId });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found or you don't have permission to delete it",
      });
    }

    // Delete all bookmarks referencing this post
    await Bookmark.deleteMany({ post: postId });

    // Delete the post
    await Post.deleteOne({ _id: postId });

    // If it's a poll post, delete associated poll data
    if (post.pollId) {
      await Poll.deleteOne({ _id: post.pollId });
    }

    res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting post",
      error: error.message,
    });
  }
};

// Edit a post
exports.updatePost = async (req, res) => {
  const userId = req.user.id;
  const { postId } = req.params;
  const { content } = req.body;

  try {
    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Content cannot be empty",
      });
    }

    // Find and verify the post belongs to the user
    const post = await Post.findOne({ _id: postId, user: userId });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found or you don't have permission to edit it",
      });
    }

    // Check if post is a repost/share
    if (post.postType === "share") {
      return res.status(400).json({
        success: false,
        message: "Shared posts cannot be edited",
      });
    }

    // Update the post
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      {
        content: content,
        isEdited: true,
        lastEditedAt: new Date(),
      },
      { new: true }
    ).populate({
      path: "user",
      select: "username name profilePic isVerified",
    });

    res.status(200).json({
      success: true,
      message: "Post updated successfully",
      data: updatedPost,
    });
  } catch (error) {
    console.error("Error updating post:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating post",
      error: error.message,
    });
  }
};

// Remove bookmark from folder
exports.removeFromFolder = async (req, res) => {
  const userId = req.user.id;
  const { folderId, bookmarkId } = req.params;

  try {
    // Find and verify the folder belongs to the user
    const folder = await Folder.findOne({
      _id: folderId,
      user: userId,
    });

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: "Folder not found or you don't have permission to modify it",
      });
    }

    // Verify bookmark exists in the folder
    if (!folder.bookmarks.includes(bookmarkId)) {
      return res.status(404).json({
        success: false,
        message: "Bookmark not found in this folder",
      });
    }

    // Remove bookmark from folder's bookmarks array
    const updatedFolder = await Folder.findByIdAndUpdate(
      folderId,
      {
        $pull: { bookmarks: bookmarkId },
      },
      { new: true }
    );

    // Update the bookmark to remove folder reference
    await Bookmark.findByIdAndUpdate(bookmarkId, { $unset: { folder: 1 } });

    res.status(200).json({
      success: true,
      message: "Bookmark removed from folder successfully",
      data: {
        folder: updatedFolder,
      },
    });
  } catch (error) {
    console.error("Error removing bookmark from folder:", error);
    return res.status(500).json({
      success: false,
      message: "Error removing bookmark from folder",
      error: error.message,
    });
  }
};

exports.deleteFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    await Folder.findByIdAndDelete(folderId);
    res.status(200).json({ message: "Folder deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error deleting folder" });
  }
};

exports.updateFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, category } = req.body; // Example update fields
    const updatedFolder = await Folder.findByIdAndUpdate(
      folderId,
      { name, category },
      { new: true }
    );
    res
      .status(200)
      .json({ message: "Folder deleted successfully", updatedFolder });
  } catch (error) {
    res.status(500).json({ error: "Error updating folder" });
  }
};
