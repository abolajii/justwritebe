// src/routes/userRoutes.js
const express = require("express");
const {
  getCurrentUser,
  getAllUsers,
  followUser,
  suggestUsers,
  getSuggestions,
  getUserNotifications,
  readNotification,
  getSingleUser,
  globalSearch,
  getConnections,
  getMutualFollowers,
  getFollowersStories,
} = require("../controllers/userController");

const { verifyToken } = require("../middleware");

const router = express.Router();

router.get("/users", [verifyToken], getAllUsers);

router.get("/search", [verifyToken], globalSearch);

router.get("/users/suggest", [verifyToken], getSuggestions);

router.post("/follow/:userId", [verifyToken], followUser);

router.get("/stories", [verifyToken], getFollowersStories);

router.get("/current/user", getCurrentUser);

router.get("/u/:id", [verifyToken], getSingleUser);

router.get("/u/:uname/c", [verifyToken], getConnections);

router.get("/suggestion", [verifyToken], suggestUsers);

router.get("/notifications", [verifyToken], getUserNotifications);

router.get("/mutual", [verifyToken], getMutualFollowers);

router.get("/notification/:id/read", [verifyToken], readNotification);

module.exports = router;
