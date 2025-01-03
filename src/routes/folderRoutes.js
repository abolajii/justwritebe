const express = require("express");
const router = express.Router();
const folderController = require("../controllers/folderController");
const mongoose = require("mongoose");
const Folder = require("../models/Folder");

// Middleware to validate ObjectId
const validateObjectId = (req, res, next) => {
  const id = req.params.id || req.params.folderId;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ID format" });
  }
  next();
};

// Middleware to validate folder item data
const validateItemData = (req, res, next) => {
  const { name, date, price, currency } = req.body;

  if (!name || !date || price === undefined || !currency) {
    return res.status(400).json({
      message: "Missing required fields",
      required: ["name", "date", "price", "currency"],
    });
  }

  if (typeof price !== "number" || price < 0) {
    return res.status(400).json({
      message: "Price must be a positive number",
    });
  }

  if (!["USD", "NGN"].includes(currency)) {
    return res.status(400).json({
      message: "Currency must be either USD or NGN",
    });
  }

  next();
};

// Routes
// GET /api/folders - Get all folders
router.get("/", folderController.getAllFolders);

// POST /api/folders - Create a new folder
router.post(
  "/",
  (req, res, next) => {
    if (!req.body.name) {
      return res.status(400).json({ message: "Folder name is required" });
    }
    next();
  },
  folderController.createFolder
);

// GET /api/folders/:id - Get a specific folder
router.get("/:id", validateObjectId, folderController.getFolder);

// POST /api/folders/:id/items - Add item to folder
router.post(
  "/:id/items",
  validateObjectId,
  validateItemData,
  folderController.addItemToFolder
);

// PUT /api/folders/:folderId/items/:itemId - Update item in folder
router.put(
  "/:folderId/items/:itemId",
  validateObjectId,
  validateItemData,
  folderController.updateItem
);

// DELETE /api/folders/:folderId/items/:itemId - Delete item from folder
router.delete(
  "/:folderId/items/:itemId",
  validateObjectId,
  folderController.deleteItem
);

// DELETE /api/folders/:id - Delete folder
router.delete("/:id", validateObjectId, folderController.deleteFolder);

// Search folders by name
router.get("/search/:query", async (req, res) => {
  try {
    const folders = await Folder.find({
      name: { $regex: req.params.query, $options: "i" },
    });
    res.json(folders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get folder statistics
router.get("/:id/stats", validateObjectId, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const stats = {
      totalItems: folder.items.length,
      totalByCurrency: {
        USD: folder.items
          .filter((item) => item.currency === "USD")
          .reduce((sum, item) => sum + item.price, 0),
        NGN: folder.items
          .filter((item) => item.currency === "NGN")
          .reduce((sum, item) => sum + item.price, 0),
      },
      itemsDueToday: folder.items.filter((item) => {
        const itemDate = new Date(item.date);
        const today = new Date();
        return itemDate.toDateString() === today.toDateString();
      }).length,
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
