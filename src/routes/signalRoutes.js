const express = require("express");
const router = express.Router();
const authController = require("../controllers/signalController");
const { verifyToken, checkAndCreateDailySignal } = require("../middleware");

router.post(
  "/create/future",
  [verifyToken, checkAndCreateDailySignal],
  authController.createFutureAccount
); // Register endpoint

router.get(
  "/user/signal",
  [verifyToken, checkAndCreateDailySignal],
  authController.getUserSignalsByLoggedInUser
);

router.get(
  "/signal",
  [verifyToken, checkAndCreateDailySignal],
  authController.getSignalsByLoggedInUser
);

router.get(
  "/signal/:id",
  [verifyToken, checkAndCreateDailySignal],
  authController.getSignalById
);

router.get(
  "/daily",
  [verifyToken, checkAndCreateDailySignal],
  authController.getUserDailySignal
);

module.exports = router;
