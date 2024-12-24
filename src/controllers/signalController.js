const User = require("../models/User");
const Signal = require("../models/Signal");
const UserSignal = require("../models/UserSignal");
const { getPreviousCapital } = require("../utils");

exports.createFutureAccount = async (req, res) => {
  const {
    reminder,
    country,
    startingCapital,
    numberOfSignals,
    reminderSettings,
    totalSignals,
    tradeSchedule,
  } = req.body;

  try {
    // Check if user already has signals set up
    const existingUserSignal = await UserSignal.findOne({ user: req.user.id });

    if (existingUserSignal) {
      return res
        .status(400)
        .json({ error: "User already has signals configured!" });
    }

    // Calculate previous capital
    const results = await getPreviousCapital(
      startingCapital,
      numberOfSignals,
      totalSignals
    );

    console.log({
      reminder,
      country,
      startingCapital,
      numberOfSignals,
      reminderSettings,
      totalSignals,
      tradeSchedule,
      results,
    });

    // Create signals based on reminder settings
    const createdSignals = [];
    for (const setting of reminderSettings) {
      // Check if signal already exists for this time slot
      const existingSignal = await Signal.findOne({
        user: req.user.id,
        startTime: setting.startTime,
        endTime: setting.endTime,
      });

      if (!existingSignal) {
        // Create new signal
        const newSignal = await Signal.create({
          user: req.user.id,
          userTrade: false,
          startingCapital: 0,
          name: `Signal ${setting.id || ""}`,
          reminder: setting.isEnabled,
          startTime: setting.startTime,
          endTime: setting.endTime,
        });
        createdSignals.push(newSignal);
      }
    }

    // Create main user signal record and include signals
    const newUserSignal = await UserSignal.create({
      user: req.user.id,
      startingCapital:
        tradeSchedule === "inbetween"
          ? results.previousCapital
          : startingCapital,
      reminder,
      numberOfSignals: totalSignals,
      signals: createdSignals.map((signal) => signal._id), // Store references to Signal documents
    });

    // Update user's country
    await User.findByIdAndUpdate(
      req.user.id,
      { country: country.name },
      { new: true }
    );

    // Prepare response
    const response = {
      userSignal: newUserSignal,
      signals: createdSignals,
      calculatedCapital: results.previousCapital,
    };

    res.status(201).json({
      success: true,
      message: "Future account created successfully",
      data: response,
    });
  } catch (error) {
    console.error("Create Future Account Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create future account",
      details: error.message,
    });
  }
};

exports.deleteUserSignal = async (req, res) => {
  try {
    const userSignal = await UserSignal.findOne({ user: req.user.id });

    if (!userSignal) {
      return res.status(404).json({
        success: false,
        error: "User signal configuration not found",
      });
    }

    await UserSignal.findByIdAndDelete(userSignal._id);

    res.status(200).json({
      success: true,
      message: "User signal configuration deleted successfully",
    });
  } catch (error) {
    console.error("Delete User Signal Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete user signal configuration",
      details: error.message,
    });
  }
};

exports.getUserSignalsByLoggedInUser = async (req, res) => {
  try {
    const user = req.user.id; // Extract user ID from req.user
    const userSignals = await UserSignal.findOne({ user }); // Find signals belonging to the user

    // over check if signal has already been created for the user if not create based not numberOfSignal

    if (!userSignals || userSignals.length === 0) {
      return res
        .status(404)
        .json({ message: "No signals found for this user." });
    }

    res.status(200).json(userSignals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSignalsByLoggedInUser = async (req, res) => {
  try {
    const user = req.user.id; // Extract user ID from req.user
    const signals = await Signal.find({ user }).sort({
      createdAt: -1,
    }); // Find signals belonging to the user

    // over check if signal has already been created for the user if not create based not numberOfSignal

    if (!signals || signals.length === 0) {
      return res
        .status(404)
        .json({ message: "No signals found for this user." });
    }

    res.status(200).json(signals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSignalById = async (req, res) => {
  try {
    // Get signal by ID and authenticated user
    const signal = await Signal.findOne({
      _id: req.params.id,
      user: req.user.id,
    }).lean();

    if (!signal) {
      return res.status(404).json({
        success: false,
        error: "Signal not found or unauthorized",
      });
    }

    // Get user signal configuration for additional context
    const userSignal = await UserSignal.findOne({
      user: req.user.id,
    }).lean();

    if (!userSignal) {
      return res.status(404).json({
        success: false,
        error: "User signal configuration not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        signal,
        userSignal,
      },
    });
  } catch (error) {
    console.error("Get Signal By ID Error:", error);

    // Handle invalid ObjectId error specifically
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        error: "Invalid signal ID format",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to get signal",
      details: error.message,
    });
  }
};

exports.getUserDailySignal = async (req, res, next) => {
  try {
    const dailySignals = await DailySignal.find({ user: req.user.id });

    if (!dailySignals || dailySignals.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No daily signals found for this user",
      });
    }

    res.status(200).json({
      success: true,
      data: dailySignals,
    });
  } catch (error) {
    console.error("Get Daily Signals Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch daily signals",
      details: error.message,
    });
  }
};
