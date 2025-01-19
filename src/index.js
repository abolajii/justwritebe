require("dotenv").config();
const express = require("express");
const postRoutes = require("./routes/postRoutes");
const authRoutes = require("./routes/authRoutes");
const messageRoutes = require("./routes/messageRoutes");
const folderRoutes = require("./routes/folderRoutes");

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
const DailySignal = require("./models/DailySignal");
const FolderList = require("./models/FolderList");

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
app.use("/api/v1/folder", folderRoutes);

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
  recentCapital: 115.44,
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

// const listAllSignal = async () => {
//   try {
//     const response = await Signal.find({
//       user: "6726114ab89139668bc660bb",
//     });

//     for (let index = 0; index < response.length; index++) {
//       const element = response[index];
//       if (element.name === "Signal 1") {
//         element.startTime = "14:00";
//         element.endTime = "14:30";

//         await element.save();
//       } else {
//         element.startTime = "19:00";
//         element.endTime = "19:30";

//         await element.save();
//       }
//     }

//     // const userSignal = await UserSignal.findOne({
//     //   user: "6726114ab89139668bc660bb",
//     // });

//     // const signal = response[1];
//     // signal.prevCapital = 115.44707199999999;
//     // signal.capital = 115.44707199999999;

//     // userSignal.startingCapital = 115.44707199999999;

//     // await userSignal.save();
//     // await signal.save();

//     console.log(response);
//   } catch (error) {
//     console.log(error);
//   }
// };

// listAllSignal();

// Get all signals

const addDeposit = async () => {
  // Create main user signal record and include signals

  await UserSignal.deleteMany();
  await DailySignal.deleteMany();
  await Signal.deleteMany();

  // await FolderList.deleteMany();

  // await

  // signal.startingCapital = 14.215;

  // also check if the
  // await signal.save();
};

// addDeposit();

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
