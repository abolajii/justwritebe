const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Assuming you have a User model
const path = require("path");
const fs = require("fs");

const ImageKit = require("imagekit");
const Post = require("../models/Post");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: `https://ik.imagekit.io/${process.env.IMAGEKIT_ID}`,
});

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

    // Save the user in the database
    await newUser.save();

    // Generate a token for the user
    const token = jwt.sign(
      { id: newUser._id, username: newUser.username },
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
        profilePic: newUser.profilePic,
        isVerified: newUser.isVerified,
        following: 0,
        followers: 0,
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

    // Generate a token for the user
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Send back token and user details
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic,
        isVerified: user.isVerified,
        following: user.following.length,
        followers: user.followers.length,
        postCount, // Add post count here
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error logging in", error });
  }
};
