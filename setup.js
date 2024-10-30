const fs = require("fs");
const path = require("path");

// Function to create directories and files
const createFile = (filePath, content) => {
  const dir = path.dirname(filePath);

  // Check if directory exists, if not, create it
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write the file
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`${filePath} created successfully.`);
};

// Contents for each file

const appJsContent = `
require('dotenv').config();
const express = require('express');
const postRoutes = require('./routes/postRoutes');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use('/api/v1', postRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(port, () => {
      console.log(\`Server running on port \${port}\`);
    });
  })
  .catch((err) => console.error(err));
`;

const postRoutesJsContent = `
const express = require('express');
const router = express.Router();
const { createPost, createComment, replyToComment, replyToReply } = require('../controllers/postController');

// Post Routes
router.post('/', createPost);
router.post('/:postId/comments', createComment);
router.post('/comments/:commentId/replies', replyToComment);
router.post('/replies/:replyId/replies', replyToReply);

module.exports = router;
`;

const postControllerJsContent = `
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Reply = require('../models/Reply');

// Create Post
exports.createPost = async (req, res) => {
  try {
    const post = new Post({
      content: req.body.content,
      user: req.user.id, // assuming user is authenticated
    });
    await post.save();
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create Comment on Post
exports.createComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = new Comment({
      content: req.body.comment,
      user: req.user.id,
      post: req.params.postId,
    });

    await comment.save();
    post.comments.push(comment._id);
    await post.save();
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reply to a Comment
exports.replyToComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const reply = new Reply({
      content: req.body.reply,
      user: req.user.id,
      comment: req.params.commentId,
    });

    await reply.save();
    comment.replies.push(reply._id);
    await comment.save();
    res.status(201).json(reply);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reply to a Reply
exports.replyToReply = async (req, res) => {
  try {
    const reply = await Reply.findById(req.params.replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });

    const newReply = new Reply({
      content: req.body.reply,
      user: req.user.id,
      reply: req.params.replyId,
    });

    await newReply.save();
    reply.replies.push(newReply._id);
    await reply.save();
    res.status(201).json(newReply);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
`;

const postModelContent = `
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  content: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
});

module.exports = mongoose.model('Post', postSchema);
`;

const commentModelContent = `
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  content: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Reply' }],
});

module.exports = mongoose.model('Comment', commentSchema);
`;

const replyModelContent = `
const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  content: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
  reply: { type: mongoose.Schema.Types.ObjectId, ref: 'Reply' },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Reply' }],
});

module.exports = mongoose.model('Reply', replySchema);
`;

const envContent = `
PORT = 9004
URI = mongodb+srv://dev:ilovecode@develoer.k30p2.mongodb.net/justchatv4
JWT_SECRET = $th!s-$ecret
`;

// Create all files and directories

createFile("app.js", appJsContent);
createFile("routes/postRoutes.js", postRoutesJsContent);
createFile("controllers/postController.js", postControllerJsContent);
createFile("models/Post.js", postModelContent);
createFile("models/Comment.js", commentModelContent);
createFile("models/Reply.js", replyModelContent);
createFile(".env", envContent);
