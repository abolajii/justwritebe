const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Assuming you have a User model
const path = require("path");
const fs = require("fs");
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
      password: hashedPassword, // Store hashed password
    });

    if (profilePic) {
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

      // Generate the upload path based on the current date
      const uploadDir = path.join(
        __dirname,
        `../uploads/${username}`,
        formattedDate
      );

      // Create the directory if it does not exist
      fs.mkdirSync(uploadDir, { recursive: true });

      const uploadedFile = req.files.profilePic;
      const filePath = path.join(uploadDir, uploadedFile.name); // Remove the username from the file path

      // Move the uploaded file to the desired directory
      await uploadedFile.mv(filePath);

      // Set the imageUrl to the path where the image is accessible
      newUser.profilePic = `/uploads/${username}/${formattedDate}/${uploadedFile.name}`;
    }

    await newUser.save();

    // Generate a token for the user
    const token = jwt.sign(
      { id: newUser._id, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: "1d" } // Token expires in 1 hour
    );

    // Send back token and user details
    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
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
    });

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
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error logging in", error });
  }
};
