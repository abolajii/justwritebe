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
    // Calculate previous capital
    const results = getPreviousCapital(
      startingCapital,
      numberOfSignals,
      totalSignals
    );

    // Check if user already has signals set up
    const userSignal = await UserSignal.findOne({ user: req.user.id });

    if (userSignal) {
      return res
        .status(400)
        .json({ error: "User already has signals configured!" });
    }

    console.log({
      reminder,
      country,
      startingCapital,
      numberOfSignals,
      reminderSettings,
      totalSignals,
      tradeSchedule,
    });

    // Create main user signal record
    const newUserSignal = await UserSignal.create({
      user: req.user.id,
      startingCapital:
        tradeSchedule === "inbetween"
          ? results.previousCapital
          : startingCapital,
      reminder,
      numberOfSignals,
    });

    console.log(newUserSignal);

    // Process reminder settings
    const signalPromises = reminderSettings.map(async (setting) => {
      // Check if signal already exists for this time slot
      const existingSignal = await Signal.findOne({
        user: req.user.id,
        startTime: setting.startTime,
        endTime: setting.endTime,
      });

      if (!existingSignal) {
        // Create new signal if none exists
        return Signal.create({
          user: req.user.id,
          userTrade: false,
          startingCapital: 0,
          name: `Signal ${setting.id || ""}`,
          reminder: setting.isEnabled, // Use specific reminder or default
          startTime: setting.time,
          endTime: setting.endTime,
        });
      }
      return null;
    });

    // Wait for all signal creations to complete
    const createdSignals = await Promise.all(signalPromises);

    // Update user's country
    await User.findByIdAndUpdate(
      req.user.id,
      { country: country.name },
      { new: true }
    );

    // Prepare response
    const response = {
      userSignal: newUserSignal,
      signals: createdSignals.filter((signal) => signal !== null), // Remove null values from skipped signals
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
