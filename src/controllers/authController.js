const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Assuming you have a User model
const path = require("path");
const fs = require("fs");

const ImageKit = require("imagekit");
const Post = require("../models/Post");
const Story = require("../models/Story");
const UserSignal = require("../models/UserSignal");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: `https://ik.imagekit.io/${process.env.IMAGEKIT_ID}`,
});

exports.me = async (req, res) => {
  try {
    // Retrieve the authenticated user's ID from the decoded token
    const userId = req.user.id;

    // Fetch the user's details
    const user = await User.findById(userId)
      .populate("following")
      .populate("followers");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Count the number of posts by the user
    const postCount = await Post.countDocuments({ user: userId });

    // Fetch the user's stories and populate views
    const userStories = await Story.find({ user: userId })
      .populate("user", "name username profilePic") // Populate user details
      .populate({
        path: "views.user", // Populate the viewers
        select: "name username profilePic isVerified", // Select specific fields for the viewers
      });

    // Group the stories by user
    const groupedStories = userStories.reduce((grouped, story) => {
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

    // Respond with the user details and related data
    res.status(200).json({
      message: "User details retrieved successfully",
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        isViewed: user.isViewed,
        link: user.link,
        bio: user.bio,
        location: user.location,
        email: user.email,
        profilePic: user.profilePic,
        isVerified: user.isVerified,
        following: user.following.length,
        followers: user.followers.length,
        lastLogin: user.lastLogin,
        backdrop: user.backdrop,
        postCount, // Include post count
        stories: Object.values(groupedStories), // Grouped stories
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving user details", error });
  }
};

// Register a new user
exports.register = async (req, res) => {
  const { username, name, email, password } = req.body;
  const { profilePic } = req.files;

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create a new user
    const newUser = new User({
      username,
      name,
      email,
      password: hashedPassword,
      lastLogin: Date.now(),
    });

    if (profilePic) {
      // Upload the profile picture to ImageKit
      const uploadResponse = await imagekit.upload({
        file: profilePic.data.toString("base64"), // base64 encoded string
        fileName: `${username}_${Date.now()}`, // A unique file name
        folder: `/profile_pics/${username}`, // Optional folder path in ImageKit
      });

      // Set the profile picture URL from ImageKit's response
      newUser.profilePic = uploadResponse.url;
    }

    newUser.isViewed = true;

    // Save the user in the database
    await newUser.save();

    // Generate a token for the user
    const token = jwt.sign(
      { id: newUser._id, username: newUser.username, name: newUser.name },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Send back the token and user details
    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        bio: newUser.bio,
        link: newUser.link,
        location: newUser.location,
        profilePic: newUser.profilePic,
        isVerified: newUser.isVerified,
        following: 0,
        followers: 0,
        lastLogin: newUser.lastLogin,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error registering user", error });
  }
};

// User login
exports.login = async (req, res) => {
  const { identifier, password } = req.body; // Use 'identifier' for email or username

  try {
    // Check if the user exists by email or username
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    })
      .populate("following")
      .populate("followers");

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid email/username or password" });
    }

    // Check if the password is correct
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Invalid email/username or password" });
    }

    // Count the number of posts by the user
    const postCount = await Post.countDocuments({ user: user._id });

    // Fetch the user's stories
    const userStories = await Story.find({ user: user._id }).populate(
      "user",
      "name username profilePic"
    ); // Optionally populate the user details

    user.lastLogin = Date.now();

    await user.save();

    const userSignal = await UserSignal.findOne({ user: user._id });

    console.log({ userSignal });

    const isUserSignal = userSignal !== null;

    // Step 4: Group the stories by user
    const groupedStories = userStories.reduce((grouped, story) => {
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

    // Generate a token for the user
    const token = jwt.sign(
      { id: user._id, username: user.username, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    console.log(user);

    // Send back token, user details, and stories
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        isUserSignal,
        isUserSignal: userSignal,
        username: user.username,
        bio: user.bio,
        link: user.link,
        location: user.location,
        name: user.name,
        email: user.email,
        isViewed: user.isViewed,
        profilePic: user.profilePic,
        isVerified: user.isVerified,
        following: user.following.length,
        followers: user.followers.length,
        backdrop: user.backdrop,
        lastLogin: user.lastLogin,
        postCount, // Add post count here
        stories: Object.values(groupedStories), // Return only the grouped stories as an array
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error logging in", error });
  }
};
