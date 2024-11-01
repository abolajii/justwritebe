const fs = require("fs");
const path = require("path");
const User = require("../models/User");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const TrendingWord = require("../models/TrendingWord");
const { createNotification } = require("../utils");

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
      //     // Get the current date for the folder structure
      const currentDate = new Date();

      const formattedDate = `${currentDate.getFullYear()}-${(
        currentDate.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}-${currentDate
        .getDate()
        .toString()
        .padStart(2, "0")}`;

      //     // Generate the upload path based on the current date and post ID
      const uploadDir = path.join(
        __dirname,
        `../uploads/posts/${post._id}`,
        formattedDate
      );

      //     console.log(req.files.imagePost);

      //     // Create the directory if it does not exist
      fs.mkdirSync(uploadDir, { recursive: true });

      const uploadedFile = req.files.imagePost;
      const filePath = path.join(uploadDir, uploadedFile.name);

      //     // Move the uploaded file to the desired directory
      await uploadedFile.mv(filePath);

      //     // Set the imageUrl to the path where the image is accessible
      post.imageUrl = `/uploads/posts/${post._id}/${formattedDate}/${uploadedFile.name}`;
    }
    await updateTrendingWords(content);
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
    await updateTrendingWords(content);
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
    await updateTrendingWords(content);

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
    await updateTrendingWords(content);

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
    await updateTrendingWords(req.body.content);

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

  try {
    // Fetch the logged-in user and populate the list of people they follow
    const user = await User.findById(userId).populate("following");
    const followedUsers = user.following.map((f) => f._id);

    // Fetch all posts from followed users and the logged-in user
    const posts = await Post.find({
      $or: [
        { user: { $in: followedUsers }, visibility: "followers" }, // Posts from followed users
        { user: userId }, // Posts from the logged-in user
      ],
      postType: { $in: ["normal", "quoted", "shared"] }, // Fetch normal, quoted, and shared posts
    })
      .sort({ createdAt: -1 }) // Sort by newest first
      .populate("user originalPost") // Populate the user and originalPost
      .populate({
        path: "originalPost", // Populate the original post and its related data
        populate: [
          { path: "user", model: "User" }, // Populate the user of the original post
          {
            path: "comments", // Populate the comments of the original post
            populate: { path: "user", model: "User" }, // Populate the user for each comment
          },
          {
            path: "originalPost", // Recursively populate the originalPost within originalPost
            populate: [
              { path: "user", model: "User" }, // Populate the user of the nested original post
              {
                path: "comments", // Populate the comments of the nested original post
                populate: { path: "user", model: "User" }, // Populate the user of each nested comment
              },
            ],
          },
        ],
      })
      .populate({
        path: "comments", // Populate the comments for the main post
        populate: { path: "user", model: "User" }, // Populate the user of each comment
      })
      .populate("mentions") // Populate the mentions field
      .exec();

    // Map over posts to include `isBookmarked` field
    const postsWithBookmarkStatus = posts.map((post) => {
      const isBookmarked = post.bookmarks.includes(userId); // Check if the current user has bookmarked the post
      return {
        ...post._doc, // Include the original post data
        isBookmarked, // Add the bookmark status for the current user
      };
    });

    return res.status(200).json(postsWithBookmarkStatus);
  } catch (error) {
    res.status(500).json({ message: "Error fetching feed", error });
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
  const userId = req.user.id; // Assuming user is authenticated and user ID is in req.user._id
  const { postId } = req.params;

  try {
    // Find the post by ID
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if the post is already bookmarked by the user
    const isBookmarked = post.bookmarks.includes(userId);

    if (isBookmarked) {
      // Unbookmark: remove user ID from the bookmarks array
      post.bookmarks.pull(userId);
      await post.save();
      return res
        .status(200)
        .json({ message: "Post unbookmarked successfully" });
    } else {
      // Bookmark: add user ID to the bookmarks array
      post.bookmarks.push(userId);
      await post.save();
      return res.status(200).json({ message: "Post bookmarked successfully" });
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
        select: "name email profilePic username", // Select the fields you want from the user
      })
      .populate({
        path: "comments", // Populate the comments on the post
        populate: [
          {
            path: "user", // Get the user who created each comment
            select: "name email profilePic username", // Select fields you want from the user
          },
          {
            path: "replies", // Populate replies for each comment
            populate: {
              path: "user", // Get the user for each reply
              select: "name email profilePic username", // Select fields you want from the user
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
  const { content, imageUrl, scheduledTime, visibility } = req.body;

  try {
    const newPost = await Post.create({
      content,
      imageUrl,
      user: req.user.id,
      scheduledTime,
      isScheduled: true,
      visibility,
    });

    res.status(201).json(newPost);
  } catch (error) {
    res.status(500).json({ message: "Error creating scheduled post", error });
  }
};

// Function to process all posts and update trending words
const processPostsForTrendingWords = async () => {
  console.log("Running");

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

// processPostsForTrendingWords();
