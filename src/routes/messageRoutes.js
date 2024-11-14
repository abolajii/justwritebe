const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const { verifyToken } = require("../middleware");

router.get("/c", [verifyToken], messageController.checkOrCreateConversation);

router.post("/group", [verifyToken], messageController.createGroupConversation);

router.post("/send", [verifyToken], messageController.sendMessage);

router.get(
  "/participants",
  [verifyToken],
  messageController.getParticipantsInGroup
);

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

router.put("/add", [verifyToken], messageController.addParticipantToGroup);

router.get(
  "/user/conversation",
  [verifyToken],
  messageController.getUserConversations
);

module.exports = router;
