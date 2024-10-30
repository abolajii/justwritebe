require("dotenv").config();
const express = require("express");
const postRoutes = require("./src/routes/postRoutes");
const authRoutes = require("./src/routes/authRoutes");
const mongoose = require("mongoose");
const userRoutes = require("./src/routes/userRoutes");
const fileUpload = require("express-fileupload");
const app = express();
const port = process.env.PORT || 3000;
const path = require("path");

const cors = require("cors");
const { requestLogger } = require("./src/middleware");

app.use("/uploads", express.static(path.join(__dirname, "src", "/uploads")));

app.use(cors());
app.use(fileUpload());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// app.use("/api/v1/uploads", express.static(path.join(__dirname, "uploads")));

app.use(requestLogger);

app.use("/api/v1", authRoutes);
app.use("/api/v1", postRoutes);
app.use("/api/v1", userRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.URI)
  .then(() => {
    console.log("MongoDB connected");
    // app.listen(port, () => {
    //   console.log(`Server running on port ${port}`);
    // });
  })
  .catch((err) => console.error(err));

module.exports = (req, res) => app(req, res);
