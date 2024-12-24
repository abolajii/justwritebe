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
  [verifyToken],
  authController.getUserSignalsByLoggedInUser
);

router.get("/signal", [verifyToken], authController.getSignalsByLoggedInUser);

router.get("/signal/:id", [verifyToken], authController.getSignalById);

module.exports = router;
