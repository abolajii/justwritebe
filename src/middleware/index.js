const jwt = require("jsonwebtoken");
const UserSignal = require("../models/UserSignal");
const Signal = require("../models/Signal");
const DailySignal = require("../models/DailySignal");

const requestLogger = (req, res, next) => {
  // Log the request details
  const { method, url, body, query } = req;
  // console.log(`Request: ${method} ${url}`);
  // console.log(`Query Params:`, query);
  // console.log(`Request Body:`, body);

  // Store the original send method
  const originalSend = res.send;

  // Override res.send to capture response data
  res.send = function (data) {
    console.log(`Response Body:`, data); // Log the response data
    originalSend.call(this, data); // Call the original send method
  };

  next(); // Call the next middleware
};

const verifyToken = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1]; // Token is expected in the "Authorization" header as "Bearer <token>"

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access Denied. No token provided." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET); // Verify the token using your secret key
    req.user = verified; // Attach the decoded token data (like user id) to the request object

    // console.log(req.user);
    next(); // Continue to the next middleware or route handler
  } catch (error) {
    res.status(400).json({ message: "Invalid Token." });
  }
};

const checkAndCreateDailySignal = async (req, res, next) => {
  try {
    const userId = req.user.id; // Assuming `req.user` contains the authenticated user's info

    // 1. Find the UserSignal
    const userSignal = await UserSignal.findOne({ user: userId }).populate(
      "signals"
    );

    if (!userSignal) {
      return res
        .status(404)
        .json({ message: "UserSignal not found for this user." });
    }

    if (userSignal.startingCapital === 0) {
      next();
    }

    // 2. Check today's daily signals
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const dailySignals = await DailySignal.find({
      user: userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });

    if (dailySignals.length >= userSignal.numberOfSignals) {
      // return res.status(400).json({
      //   message: "Daily signal limit reached for the user.",
      // });

      next();
    }

    // 3. Iterate through the signals array and create a DailySignal for each
    const signals = userSignal.signals || [];
    if (signals.length === 0) {
      next();
    }

    const createdDailySignals = [];

    for (const signal of signals) {
      const { reminder, startTime, endTime, name, userTrade } = signal;

      const dailySignal = new DailySignal({
        user: userId,
        capital: 0,
        reminder,
        time: `${startTime} - ${endTime}`,
        name,
        userTrade: userTrade || false,
        profit: "0", // Default profit value; you can adjust this logic
      });

      await dailySignal.save();
      createdDailySignals.push(dailySignal);
    }

    // res.status(201).json({
    //   message: "Daily signals created successfully.",
    //   dailySignals: createdDailySignals,
    // });

    next();
  } catch (error) {
    console.error("Error in checkAndCreateDailySignal middleware:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = checkAndCreateDailySignal;

module.exports = { verifyToken, requestLogger };
