const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const ImageKit = require("imagekit");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: `https://ik.imagekit.io/${process.env.IMAGEKIT_ID}`,
});

exports.createGroupConversation = async (req, res) => {
  try {
    const { participants, groupName } = req.body;
    const { id } = req.user;
    const file = req.files?.file;
    console.log(req.user);

    // Ensure there's a group name for group conversations
    // if (!groupName) {
    //   return res
    //     .status(400)
    //     .json({ message: "Group name is required for group conversations." });
    // }

    // Ensure there are participants provided
    if (participants.length < 2) {
      return res.status(400).json({
        message:
          "At least two participants are required for a group conversation.",
      });
    }

    // Check if a group conversation with this name already exists
    let conversation = await Conversation.findOne({
      isGroup: true,
      groupName: groupName,
    });

    if (!conversation) {
      // Create a new group conversation
      conversation = new Conversation({
        participants: [id, ...participants],
        isGroup: true,
        groupName: groupName,
        createdBy: id,
      });

      const sanitizedGroupName = groupName.replace(/[^a-zA-Z0-9_-]/g, "_");

      if (file) {
        // Upload the profile picture to ImageKit
        const uploadResponse = await imagekit.upload({
          file: file.data.toString("base64"), // base64 encoded string
          fileName: `${sanitizedGroupName}_${Date.now()}`, // A unique file name
          folder: `/conversations/${sanitizedGroupName}`, // Correct folder path format
        });

        conversation.profilePic = uploadResponse.url;
      }
      await conversation.save();
    } else {
      // Update existing conversation if necessary (e.g., add new participants)
      // Optional: Add logic to update participants if needed
    }

    res.status(201).json({
      message: "Group conversation created or found!",
      conversation,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creating or finding group conversation",
      error: error.message,
    });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const { participants } = req.body;

    if (participants.length !== 2) {
      return res.status(400).json({
        message:
          "Exactly two participants are required for one-on-one conversations.",
      });
    }

    // Check if a one-on-one conversation already exists between these participants
    let conversation = await Conversation.findOne({
      participants: { $all: participants },
      isGroup: false,
    });

    if (!conversation) {
      // Create a new one-on-one conversation
      conversation = new Conversation({
        participants: participants,
        isGroup: false,
      });
      await conversation.save();
    }

    res.status(201).json({
      message: "One-on-one conversation created or found!",
      conversation,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creating or finding one-on-one conversation",
      error: error.message,
    });
  }
};

exports.getUserConversations = async (req, res) => {
  try {
    // Fetch conversations for the logged-in user
    const userId = req.user.id;
    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name avatar") // Fetch participant names and avatars
      .populate("lastMsg", "text createdAt sender") // Fetch last message details
      .exec();

    // Format each conversation
    const formattedConversations = conversations.map((conv) => {
      // Determine if it's a group or individual chat
      const isGroup = conv.isGroup;
      const participants = conv.participants.map((participant) => ({
        id: participant._id,
        name: participant.name,
        avatar: participant.avatar,
      }));

      // Identify the last message sender's name if available
      const lastMessageSender = conv.lastMsg?.sender?.name || "";

      // Check if this is a new conversation without messages
      let messageText = conv.lastMsg?.text || "";
      if (!messageText && !lastMessageSender && isGroup) {
        const creatorName =
          participants.find((p) => p.id.toString() === userId)?.name || "Admin";
        messageText = `${creatorName} created a group`;
      }

      // Format conversation object with conditional fields
      return {
        id: conv._id,
        name: isGroup
          ? conv.groupName === ""
            ? "Default Group Chat"
            : conv.groupName
          : participants.find((p) => p.id.toString() !== userId)?.name,
        message: messageText,
        time: conv.lastMsg ? conv.lastMsg.createdAt.toLocaleTimeString() : "",
        alertCount: conv.messages ? conv.messages.length : 0, // Assuming total messages as alert count
        status: conv.pinned, // Assuming 'pinned' status
        profilePic: isGroup
          ? conv.profilePic || null
          : participants.find((p) => p.id.toString() !== userId)?.profilePic,
        pinned: conv.pinned,
        isGroup: isGroup,
        lastMessageSender: lastMessageSender || null,
        groupMembers:
          isGroup && participants.length
            ? participants.map((p) => p.name)
            : null,
        groupAvatars:
          isGroup && participants.length
            ? participants.slice(0, 3).map((p) => p.avatar)
            : null,
      };
    });

    res.status(200).json(formattedConversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Error fetching conversations", error });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, content } = req.body;
    const senderId = req.user.id;

    // Find the conversation by its ID
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    let messages = []; // Array to hold the messages created

    // Determine the receivers (all participants except the sender)
    const receivers = conversation.participants.filter(
      (u) => u.toString() !== senderId.toString()
    );

    if (req.files && req.files.file) {
      const files = Array.isArray(req.files.file)
        ? req.files.file
        : [req.files.file];
      const filePaths = await uploadFiles(files); // Upload files and get file paths

      // Create separate messages for each file
      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];

        // Create a new Message document with the file path
        const message = new Message({
          sender: senderId,
          content: "", // No content since it's a file message
          file: filePath,
          seenBy: [senderId],
          receiver: receivers, // Correctly set the receivers
        });

        await message.save();

        // Add the message ID to the conversation
        conversation.messages.push(message._id);
        conversation.lastMsg = message._id;
        messages.push(message);

        // Emit new message event to other participants
        socket
          .getIo()
          .to(receivers.map((p) => p.toString()))
          .emit("newMessage", message);
      }

      await conversation.save();
    } else {
      // If no files, create a normal text message
      const message = new Message({
        sender: senderId,
        content: content,
        seenBy: [senderId],
        receiver: receivers, // Correctly set the receivers
      });

      await message.save();

      // Add the message to the conversation
      conversation.messages.push(message._id);
      conversation.lastMsg = message._id;
      await conversation.save();

      // Emit new message event to other participants
      socket
        .getIo()
        .to(receivers.map((p) => p.toString()))
        .emit("newMessage", message);

      messages.push(message);
    }

    res.status(201).json({
      message: "Messages sent successfully!",
      messages, // Array of messages sent
    });
  } catch (error) {
    res.status(500).json({
      message: "Error sending message",
      error: error.message,
    });
  }
};

exports.getMessagesInAConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Find the conversation by ID and populate messages
    const conversation = await Conversation.findById(conversationId)
      .populate({
        path: "messages",
        populate: {
          path: "sender receiver", // Populate sender and receiver details if needed
          select: "name profilePic", // Select only the fields you need (e.g., name, avatar)
        },
      })
      .exec();

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Return the messages array
    res.status(200).json({
      message: "Messages retrieved successfully",
      messages: conversation.messages,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error retrieving messages",
      error: error.message,
    });
  }
};
