const express = require("express");
const router = express.Router();
const {
  createPost,
  createComment,
  replyToComment,
  getFeeds,
  quotePost,
  sharePost,
  toggleLikePost,
  getTrendingWords,
  handleBookMark,
  getPostById,
  schedulePost,
} = require("../controllers/postController");
const { verifyToken } = require("../middleware");

// Post Routes
router.post("/posts", [verifyToken], createPost);
router.post("/schedule/post", [verifyToken], schedulePost);
router.post("/posts/:postId/comments", [verifyToken], createComment);
router.post("/comments/:commentId/reply", [verifyToken], replyToComment);

router.get("/feeds", [verifyToken], getFeeds);
router.get("/trends", [verifyToken], getTrendingWords);

router.post("/posts/:postId/share", [verifyToken], sharePost);
router.get("/posts/:postId", [verifyToken], getPostById);

router.post("/posts/:postId/quote", [verifyToken], quotePost);
router.post("/posts/:postId/bookmark", [verifyToken], handleBookMark);
router.post("/posts/:postId/like", [verifyToken], toggleLikePost);

module.exports = router;
