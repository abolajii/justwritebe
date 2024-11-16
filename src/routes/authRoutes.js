const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware");

router.post("/register", authController.register); // Register endpoint
router.post("/login", authController.login); // Login endpoint

router.get("/me", [verifyToken], authController.me);

module.exports = router;
