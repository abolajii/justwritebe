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
    const user = await User.findOne({ username: userId }).select(
      "username name email profilePic bio location followers following isVerified link backdrop"
    ); // Including bio and location

    if (!user) {
      throw new Error("User not found");
    }

    // Fetch the posts of the user
    const posts = await Post.find({ user: user._id })
      .populate("user", "username name profilePic isVerified backdrop") // Populate the 'user' field to get user info
      // .populate("comments") // Optional: populate comments if needed
      .sort({ createdAt: -1 }); // Sort posts by creation time (newest first)

    return { user, posts };
  } catch (err) {
    console.error(err);
    throw new Error("Error fetching user profile and posts");
  }
};

exports.getUserActivityInfo = async (userId) => {
  const tag = req.query.tag;
  // tag either posts, likes, media, replies
  // get all users post, get post the user likes, and also get user media, and comment, replies to post
};

exports.getPreviousCapital = async (
  recentCapital,
  numberOfSignal,
  totalSignals
) => {
  const signalProfitPercentage = 0.88; // 88%
  const investmentPercentage = 0.01; // 1%
  let currentCapital = recentCapital;
  let allSignals = [];

  // First, work backwards to find the original capital
  for (let i = 0; i < numberOfSignal; i++) {
    const investmentAmount = currentCapital * investmentPercentage;
    const profitAmount = investmentAmount * signalProfitPercentage;
    const totalReturn = investmentAmount + profitAmount;
    currentCapital = currentCapital - totalReturn + investmentAmount;
  }

  // Now let's show the progression for all signals
  let calculatedCapital = currentCapital;
  console.log(`\nStarting Capital: $${calculatedCapital.toFixed(2)}`);

  for (let i = 0; i < totalSignals; i++) {
    const investment = calculatedCapital * investmentPercentage;
    const newCapital = calculatedCapital - investment;
    const profit = investment * signalProfitPercentage;
    const signalReturn = investment + profit;
    calculatedCapital = newCapital + signalReturn;

    // Store signal details
    allSignals.push({
      signalNumber: i + 1,
      investment: investment.toFixed(2),
      capitalAfterInvestment: newCapital.toFixed(2),
      profit: profit.toFixed(2),
      totalReturn: signalReturn.toFixed(2),
      finalCapital: calculatedCapital.toFixed(2),
    });

    // Print signal details
    console.log(`\nSignal ${i + 1}:`);
    console.log(`Investment (1%): $${investment.toFixed(2)}`);
    console.log(`Capital after investment: $${newCapital.toFixed(2)}`);
    console.log(`Profit (88%): $${profit.toFixed(2)}`);
    console.log(`Total return: $${signalReturn.toFixed(2)}`);
    console.log(`Final capital: $${calculatedCapital.toFixed(2)}`);
  }

  return {
    previousCapital: Number(currentCapital.toFixed(2)),
    signalBreakdown: allSignals,
  };
};
