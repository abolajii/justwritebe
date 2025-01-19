const User = require("../models/User");
const Signal = require("../models/Signal");
const DailySignal = require("../models/DailySignal");
const UserSignal = require("../models/UserSignal");
const { getPreviousCapital } = require("../utils");
const { default: mongoose } = require("mongoose");

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

    const results = await getPreviousCapital(
      startingCapital,
      numberOfSignals,
      totalSignals
    );

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
      startingCapital,
      reminder,
      numberOfSignals: totalSignals,
      signals: createdSignals.map((signal) => signal._id),
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
    console.log("Error details:", {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
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
    const signal = await DailySignal.findOne({
      _id: req.params.id,
      user: req.user.id,
    }).lean();

    if (!signal) {
      return res.status(404).json({
        success: false,
        error: "Daily Signal not found or unauthorized",
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

exports.getUserDailySignal = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Get user signal data
    const userSignal = await getUserSignalData(userId);
    if (!userSignal.success) {
      return res.status(404).json(userSignal);
    }

    // 2. Check for existing daily signals
    const existingSignals = await checkExistingDailySignals(userId);
    if (existingSignals.success) {
      return res.status(200).json(existingSignals);
    }
    console.log(userSignal);

    // 3. Create new daily signals
    const result = await createDailySignals(userId, userSignal.data);
    return res.status(result.success ? 201 : 404).json(result);
  } catch (error) {
    console.error("Get Daily Signals Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch or create daily signals",
      details: error.message,
    });
  }
};

// Helper Functions
async function getUserSignalData(userId) {
  const userSignal = await UserSignal.findOne({ user: userId })
    .populate("signals")
    .sort({ createdAt: -1 });

  if (!userSignal) {
    return {
      success: false,
      message: "UserSignal not found for this user.",
    };
  }

  return {
    success: true,
    data: userSignal,
  };
}

async function checkExistingDailySignals(userId) {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const dailySignals = await DailySignal.find({
    user: userId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  if (dailySignals.length > 0) {
    return {
      success: true,
      message: "Daily signals already exist for today.",
      data: dailySignals,
    };
  }

  return { success: false };
}

async function createDailySignals(userId, userSignal) {
  const signals = userSignal.signals || [];

  if (signals.length === 0) {
    return {
      success: false,
      message: "No signals associated with the UserSignal.",
    };
  }

  const createdDailySignals = await Promise.all(
    signals.map(async (signal, index) => {
      const { reminder, startTime, endTime, name } = signal;

      const dailySignal = new DailySignal({
        user: userId,
        reminder,
        time: `${startTime} - ${endTime}`,
        name,
        prevCapital: index === 0 ? userSignal.startingCapital : 0,
        recentCapital: 0,
        profit: 0,
      });

      await dailySignal.save();
      return dailySignal;
    })
  );

  return {
    success: true,
    message: "Daily signals created successfully.",
    data: createdDailySignals,
  };
}

exports.updateBalance = async (req, res) => {
  const SIGNAL_PROFIT_PERCENTAGE = 0.89;
  const INVESTMENT_PERCENTAGE = 0.01;

  try {
    const { received } = req.body;
    const userId = req.user.id;
    const signalId = req.params.id;

    // 1. Get and validate daily signal
    const dailySignal = await DailySignal.findOne({
      user: userId,
      _id: signalId,
    });

    if (!dailySignal) {
      return res.status(404).json({
        success: false,
        message: "Daily signal not found.",
      });
    }

    // 2. Handle non-received signal
    if (!received) {
      await DailySignal.findByIdAndUpdate(signalId, {
        status: "not-received",
        updatedAt: new Date(),
      });
      return res.status(200).json({
        success: true,
        message: "Signal marked as not received",
      });
    }

    // 3. Calculate new balances
    const calculations = calculateBalances({
      prevCapital: dailySignal.prevCapital,
      investmentPercentage: INVESTMENT_PERCENTAGE,
      profitPercentage: SIGNAL_PROFIT_PERCENTAGE,
    });

    // 4. Update current signal
    await DailySignal.findByIdAndUpdate(
      signalId,
      {
        recentCapital: calculations.newCapital,
        profit: calculations.profitAmount,
        status: "completed",
        updatedAt: new Date(),
      },
      { new: true }
    );

    // 5. Update next signal's prevCapital and get all signals
    const { nextSignalResult, allSignals } = await updateNextSignalAndGetAll(
      userId,
      signalId,
      calculations.newCapital
    );

    // 6. Update user's starting capital
    const userSignal = await UserSignal.findOneAndUpdate(
      { user: userId },
      { startingCapital: calculations.newCapital },
      { new: true }
    );

    if (!userSignal) {
      throw new Error("User signal not found while updating starting capital");
    }

    const response = formatResponse(dailySignal, calculations);

    return res.status(200).json({
      success: true,
      data: {
        ...response,
        nextSignalStatus: nextSignalResult.exists
          ? "Updated next signal with new capital"
          : "No next signal to update - this was the latest signal",
        allSignals: allSignals,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating balance",
      error: error.message,
    });
  }
};

async function updateNextSignalAndGetAll(userId, currentSignalId, newCapital) {
  try {
    // Get all signals for the user, sorted by creation date and name
    const allSignals = await DailySignal.find({ user: userId })
      .sort({ createdAt: 1, name: 1 })
      .lean();

    // Find the index of the current signal
    const currentIndex = allSignals.findIndex(
      (signal) => signal._id.toString() === currentSignalId
    );

    // Check if there's a next signal
    const nextSignal =
      currentIndex < allSignals.length - 1
        ? allSignals[currentIndex + 1]
        : null;

    // If there's a next signal, update it
    let updatedNextSignal = null;
    if (nextSignal) {
      updatedNextSignal = await DailySignal.findByIdAndUpdate(
        nextSignal._id,
        {
          prevCapital: newCapital,
          updatedAt: new Date(),
        },
        { new: true }
      );
    }

    if (!updatedNextSignal) {
      return {
        nextSignalResult: {
          exists: false,
          message: "No next signal found - this is the latest signal",
        },
        allSignals: allSignals.map((signal) => ({
          id: signal._id,
          createdAt: signal.createdAt,
          status: signal.status,
          prevCapital: signal.prevCapital,
          recentCapital: signal.recentCapital,
          profit: signal.profit,
          name: signal.name,
          time: signal.time,
        })),
      };
    }

    return {
      nextSignalResult: {
        exists: true,
        signal: updatedNextSignal,
      },
      allSignals: allSignals.map((signal) => ({
        id: signal._id,
        createdAt: signal.createdAt,
        status: signal.status,
        prevCapital: signal.prevCapital,
        recentCapital: signal.recentCapital,
        profit: signal.profit,
        name: signal.name,
        time: signal.time,
      })),
    };
  } catch (error) {
    throw error;
  }
}

function calculateBalances({
  prevCapital,
  investmentPercentage,
  profitPercentage,
}) {
  const investmentAmount = prevCapital * investmentPercentage;
  const profitAmount = investmentAmount * profitPercentage;
  const totalReturn = investmentAmount + profitAmount;
  const newCapital = prevCapital - investmentAmount + totalReturn;

  return {
    investmentAmount,
    profitAmount,
    totalReturn,
    newCapital,
    profitPercentageFormatted: `${(profitPercentage * 100).toFixed(2)}`,
  };
}

function formatResponse(dailySignal, calculations) {
  return {
    newBalance: calculations.newCapital,
    transaction: {
      investmentAmount: calculations.investmentAmount,
      profitAmount: calculations.profitAmount,
      totalReturn: calculations.totalReturn,
      profitPercentage: `${calculations.profitPercentageFormatted}%`,
    },
    signal: {
      id: dailySignal._id,
      name: dailySignal.name,
      time: dailySignal.time,
      profit: dailySignal.profit,
      prevCapital: dailySignal.prevCapital,
    },
  };
}

exports.groupDailySignalByCreatedDateForUser = async (req, res) => {
  const userId = req.user.id;
  try {
    const userObjectId =
      typeof userId === "number"
        ? mongoose.Types.ObjectId.createFromTime(userId)
        : new mongoose.Types.ObjectId(userId.toString());

    const groupedSignals = await DailySignal.aggregate([
      {
        $match: { user: userObjectId }, // Filter by user ID
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          signals: { $push: "$$ROOT" }, // Include the full signal data
          count: { $sum: 1 }, // Count the number of signals for each date
        },
      },
      { $sort: { _id: 1 } }, // Sort by date ascending
    ]);

    console.log(
      `Grouped Daily Signals by Created Date for User ${userId}:`,
      groupedSignals
    );
    return res.status(200).json({
      message: "All signal retrieved",
      groupedSignals,
    }); // Optionally return the data
  } catch (error) {
    res.status(500).json({
      message: `Error grouping daily signals for user ${userId}:`,
      error: error.message,
    });
  }
};

exports.addDeposit = async (req, res) => {
  try {
    const { capital } = req.body;
    const userId = req.user.id;

    // Find and update user signal
    const userSignal = await UserSignal.findOne({ user: userId });
    if (!userSignal) {
      return res.status(404).json({
        success: false,
        message: "User signal not found",
      });
    }

    // Calculate new starting capital
    const newStartingCapital = userSignal.startingCapital + capital;

    // Update user signal with new capital
    userSignal.startingCapital = newStartingCapital;
    await userSignal.save();

    // Find the first daily signal with zero recentCapital
    const dailySignal = await DailySignal.findOne({
      user: userId,
      recentCapital: 0,
    }).sort({ createdAt: 1 }); // Get the earliest one if multiple exist

    if (dailySignal) {
      // Update the prevCapital of the found daily signal
      dailySignal.prevCapital = newStartingCapital;
      await dailySignal.save();
    }

    return res.status(200).json({
      success: true,
      message: "Deposit added successfully",
      data: {
        newStartingCapital,
        updatedDailySignal: dailySignal,
      },
    });
  } catch (error) {
    console.error("Add Deposit Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to add deposit",
      details: error.message,
    });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete only signals associated with this user
    await UserSignal.deleteMany({ userId });
    await DailySignal.deleteMany({ userId });
    await Signal.deleteMany({ userId });

    // Delete the user account itself
    await User.findByIdAndDelete(userId);

    return res.status(200).json({
      success: true,
      message: "Account and associated data successfully deleted",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete account",
      error: error.message,
    });
  }
};
