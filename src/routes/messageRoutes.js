const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const { verifyToken } = require("../middleware");

router.post("/group", [verifyToken], messageController.createGroupConversation);

router.post("/send", [verifyToken], messageController.sendMessage);

router.get(
  "/conversations/:conversationId/messages",
  [verifyToken],
  messageController.getMessageInConversation
);

router.get(
  "/conversations/:conversationId",
  [verifyToken],
  messageController.getConversationById
);

router.get(
  "/user/conversation",
  [verifyToken],
  messageController.getUserConversations
);

module.exports = router;
