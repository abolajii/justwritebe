// controllers/folderController.js
const FolderList = require("../models/FolderList");

const folderController = {
  // Create a new folder
  createFolder: async (req, res) => {
    const user = req.user.id;
    try {
      const folder = new FolderList({
        name: req.body.name,
        items: [],
        user,
      });

      const savedFolder = await folder.save();
      res.status(201).json(savedFolder);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  // Get all folders
  getAllFolders: async (req, res) => {
    try {
      const folders = await FolderList.find();
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Get a single folder by ID
  getFolder: async (req, res) => {
    try {
      const folder = await FolderList.findById(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      res.json(folder);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Add item to folder
  addItemToFolder: async (req, res) => {
    try {
      const folder = await FolderList.findById(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      const newItem = {
        name: req.body.name,
        date: new Date(req.body.date),
        price: req.body.price,
        currency: req.body.currency,
      };

      folder.items.push(newItem);
      const updatedFolder = await folder.save();
      res.json(updatedFolder);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  // Update item in folder
  updateItem: async (req, res) => {
    try {
      const folder = await FolderList.findById(req.params.folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      const item = folder.items.id(req.params.itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }

      Object.assign(item, req.body);
      await folder.save();
      res.json(folder);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  // Delete item from folder
  deleteItem: async (req, res) => {
    try {
      const folder = await FolderList.findById(req.params.folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      folder.items.pull(req.params.itemId);
      await folder.save();
      res.json(folder);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  // Delete folder
  deleteFolder: async (req, res) => {
    try {
      const folder = await FolderList.findByIdAndDelete(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      res.json({ message: "Folder deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = folderController;
