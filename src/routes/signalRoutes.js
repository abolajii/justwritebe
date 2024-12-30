const express = require("express");
const router = express.Router();
const authController = require("../controllers/signalController");
const { verifyToken } = require("../middleware");

router.post(
  "/create/future",
  [verifyToken],
  authController.createFutureAccount
); // Register endpoint

router.get(
  "/user/signal",
  [verifyToken],
  authController.getUserSignalsByLoggedInUser
);

router.get("/signal", [verifyToken], authController.getSignalsByLoggedInUser);

router.get(
  "/all/signal",
  [verifyToken],
  authController.groupDailySignalByCreatedDateForUser
);

router.get("/signal/daily", [verifyToken], authController.getUserDailySignal);

router.get("/signal/:id", [verifyToken], authController.getSignalById);

router.put("/signal/:id", [verifyToken], authController.updateBalance);

router.put("/balance", [verifyToken], authController.addDeposit);

module.exports = router;
