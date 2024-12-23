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

module.exports = router;
