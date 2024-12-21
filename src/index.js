require("dotenv").config();
const express = require("express");
const postRoutes = require("./routes/postRoutes");
const authRoutes = require("./routes/authRoutes");
const messageRoutes = require("./routes/messageRoutes");
const signalRoutes = require("./routes/signalRoutes");
const mongoose = require("mongoose");
const userRoutes = require("./routes/userRoutes");
const fileUpload = require("express-fileupload");
const app = express();
const port = process.env.PORT || 3000;
const path = require("path");

// const bcrypt = require("bcryptjs");

const cors = require("cors");
const { requestLogger } = require("./middleware");
const User = require("./models/User");
const Signal = require("./models/Signal");
const UserSignal = require("./models/UserSignal");

app.use("/uploads", express.static(path.join(__dirname, "src", "/uploads")));

app.use(cors());
app.use(fileUpload());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// app.use("/api/v1/uploads", express.static(path.join(__dirname, "uploads")));

app.use(requestLogger);

app.get("/", (req, res) => {
  res
    .status(200)
    .json({ message: "Hello, JavaScript with Express on Vercel!" });
});

app.use("/api/v1", authRoutes);
app.use("/api/v1", postRoutes);
app.use("/api/v1", userRoutes);
app.use("/api/v1", messageRoutes);
app.use("/api/v1", signalRoutes);

const getPreviousCapital = (recentCapital, numberOfSignal, totalSignals) => {
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

// Test the function
const testCase = {
  recentCapital: 107.62,
  numberOfSignal: 1,
  totalSignalsPerDay: 2,
};

const result = getPreviousCapital(
  testCase.recentCapital,
  testCase.numberOfSignal,
  testCase.totalSignals
);

console.log("\nSummary:");
console.log(`Previous capital: $${result.previousCapital}`);

// Verification function to test our calculation
// const verifyCalculation = (startingCapital, signals) => {
//   let capital = startingCapital;
//   console.log(`Verification starting with $${startingCapital}:`);

//   for (let i = 0; i < signals; i++) {
//     const investment = capital * 0.01;
//     const newCapital = capital - investment;
//     const profit = investment * 0.88;
//     capital = newCapital + (investment + profit);

//     console.log(`Signal ${i + 1}:`);
//     console.log(`Investment (1%): $${investment.toFixed(2)}`);
//     console.log(`Capital after investment: $${newCapital.toFixed(2)}`);
//     console.log(`Profit (88%): $${profit.toFixed(2)}`);
//     console.log(`Total return: $${(investment + profit).toFixed(2)}`);
//     console.log(`Final capital: $${capital.toFixed(2)}\n`);
//   }

//   return Number(capital.toFixed(2));
// };

// const startingCapital = 292.27; // The result from getPreviousCapital
// verifyCalculation(startingCapital, 2);

// getPreviousCapital(user.recentCapital, user.numberOfSignal, user.totalSignals);

// Get all signals
const getAllSignals = async () => {
  try {
    const signals = await UserSignal.find(); // Fetch all signals

    await UserSignal.deleteMany();

    console.log(signals);
  } catch (error) {
    console.log(error);
    // res.status(500).json({ error: error.message });
  }
};

// getAllSignals();

// Connect to MongoDB
mongoose
  .connect(process.env.URI)
  .then(() => {
    console.log("MongoDB connected now");
    app.listen(port, () => {
      console.log(`Server running on port${port}`);
    });
  })
  .catch((err) => console.error(err));

module.exports = (req, res) => app(req, res);
