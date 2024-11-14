const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const ImageKit = require("imagekit");
const User = require("../models/User");
const Post = require("../models/Post");

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

    // Ensure there's a group name for group conversations
    // if (!groupName) {
    //   return res
    //     .status(400)
    //     .json({ message: "Group name is required for group conversations." });
    // }

    const finalParticipant = !Array.isArray(participants)
      ? [participants, id]
      : [id, ...participants];

    // Ensure there are participants provided
    if (!Array.isArray(finalParticipant) || finalParticipant.length < 2) {
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
        participants: finalParticipant,
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
    const userId = req.user.id;

    // Fetch conversations for the logged-in user
    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name profilePic")
      .populate("createdBy", "name profilePic")
      .populate({
        path: "lastMsg",
        select: "content createdAt",
        populate: { path: "sender", select: "name" },
      })
      .sort({ updatedAt: -1 })
      .exec();

    // Format each conversation
    const formattedConversations = conversations.map((conversation) => {
      // Get other participant's details in a one-on-one conversation
      const otherParticipant = !conversation.isGroup
        ? conversation.participants.find((p) => p._id.toString() !== userId)
        : null;

      // Get last message details
      const lastMessageSenderId = conversation.lastMsg?.sender?._id.toString();
      const lastMessageSenderName = conversation.lastMsg?.sender?.name || "";
      const lastMessageContent = conversation.lastMsg?.content || "";

      // Determine the message to display
      let displayMessage = "";

      if (conversation.isGroup) {
        // For group chats, show the last message or default message if no messages exist
        if (lastMessageContent) {
          displayMessage =
            lastMessageSenderId === userId
              ? `You: ${lastMessageContent}`
              : `${lastMessageSenderName}: ${lastMessageContent}`;
        } else {
          displayMessage = `${conversation.createdBy.name} created a new group`;
        }
      } else {
        // For one-on-one conversations
        if (lastMessageContent) {
          displayMessage =
            lastMessageSenderId === userId
              ? `You: ${lastMessageContent}`
              : lastMessageContent;
        } else {
          displayMessage =
            conversation.createdBy._id.toString() === userId
              ? "You started a conversation"
              : `${conversation.createdBy.name} started a conversation`;
        }
      }

      // Format conversation details
      const formattedConversation = {
        id: conversation._id,
        createdBy: conversation.createdBy,
        createdAt: conversation.createdAt,
        name: conversation.isGroup
          ? conversation.groupName || "Default Group Chat"
          : otherParticipant?.name,
        message: displayMessage,
        time: conversation.lastMsg ? conversation.lastMsg.createdAt : "",
        alertCount: conversation.messages?.length || 0,
        status: conversation.pinned,
        profilePic: conversation.isGroup
          ? conversation.profilePic || null
          : otherParticipant?.profilePic || null,
        pinned: conversation.pinned,
        isGroup: conversation.isGroup,
        lastMessageSender: lastMessageSenderName || null,
        groupMembers: conversation.isGroup ? conversation.participants : null,
      };

      return formattedConversation;
    });

    res.status(200).json(formattedConversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Error fetching conversations", error });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, content, participantId } = req.body;
    const senderId = req.user.id;

    let conversation;

    // If conversationId is provided, find the conversation
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
    } else if (participantId) {
      // Check if participantId is provided
      if (!participantId) {
        return res.status(400).json({ message: "Participant ID is required." });
      }

      // Check if the user with the given participantId exists
      const participantUser = await User.findById(participantId);
      if (!participantUser) {
        return res.status(404).json({ message: "Participant not found." });
      }

      // Check if a 1-on-1 conversation already exists with the participant
      conversation = await Conversation.findOne({
        isGroup: false,
        participants: { $all: [senderId, participantId] },
      });

      // If no conversation exists, create a new 1-on-1 conversation
      if (!conversation) {
        conversation = new Conversation({
          participants: [senderId, participantId],
          isGroup: false,
          messages: [],
        });
        await conversation.save();
      }
    }

    // If no conversation exists, return an error
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    let messages = []; // Array to hold the created messages

    // Determine receivers (empty for groups, specific for 1-on-1)
    const isGroup = conversation.isGroup;
    const receivers = isGroup
      ? []
      : conversation.participants.filter(
          (u) => u.toString() !== senderId.toString()
        );

    // Create a new message
    const message = new Message({
      sender: senderId,
      content: content,
      seenBy: [senderId],
      status: "sent",
      receiver: isGroup ? undefined : receivers,
    });

    await message.save();

    // Populate the sender field to include full user details if needed
    await message.populate("sender");

    // Add the message to the conversation
    conversation.messages.push(message._id);
    conversation.lastMsg = message._id;
    await conversation.save();

    messages.push(message);

    res.status(201).json({
      message: "Message sent successfully!",
      data: messages[0],
    });
  } catch (error) {
    res.status(500).json({
      message: "Error sending message",
      error: error.message,
    });
  }
};

exports.getMessageInConversation = async (req, res) => {
  try {
    const { conversationId } = req.params; // Get the conversation ID from the request parameters

    // Find the conversation by ID and populate the messages
    const conversation = await Conversation.findById(conversationId)
      .populate({
        path: "messages",
        populate: {
          path: "sender", // Populate the sender field in the messages
          select: "name profilePic", // Select only the name field of the sender
        },
      })
      .exec();

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Send back the messages in the conversation
    res.status(200).json({ messages: conversation.messages });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Error fetching messages",
      error: error.message,
    });
  }
};

exports.addParticipantToGroup = async (req, res) => {
  try {
    const { conversationId, selectedUsers } = req.body;

    // Find the group conversation by ID
    const conversation = await Conversation.findById(conversationId);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group conversation not found." });
    }

    const f = selectedUsers.map((s) => s._id);

    // Add the new participant to the conversation
    conversation.participants.push(...f);
    await conversation.save();

    res.status(200).json({
      message: "Participants added to group conversation!",
      conversation,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error adding participant to group conversation",
      error: error.message,
    });
  }
};

exports.removeParticipantFromGroup = async (req, res) => {
  try {
    const { conversationId, participantId } = req.body;

    // Find the group conversation by ID
    const conversation = await Conversation.findById(conversationId);

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group conversation not found." });
    }

    // Remove the participant from the conversation
    const index = conversation.participants.indexOf(participantId);
    if (index > -1) {
      conversation.participants.splice(index, 1);
      await conversation.save();

      // Notify group participants about the removal
      socket
        .getIo()
        .to(conversation.participants.map((p) => p.toString()))
        .emit("participantRemoved", { conversationId, participantId });
    } else {
      return res
        .status(400)
        .json({ message: "Participant not found in the group." });
    }

    res.status(200).json({
      message: "Participant removed from group conversation!",
      conversation,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error removing participant from group conversation",
      error: error.message,
    });
  }
};

exports.getConversationById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId)
      .populate("participants", "name profilePic username isVerified lastLogin")
      .populate("createdBy", "name profilePic") // Populate creator's name and profilePic
      .populate({
        path: "lastMsg",
        select: "text createdAt sender",
        populate: { path: "sender", select: "name" }, // Populate sender's name for last message
      });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const otherParticipant = !conversation.isGroup
      ? conversation.participants.find((p) => p._id.toString() !== userId)
      : null;

    // Get details of the last message
    const lastMessageSenderId = conversation.lastMsg?.sender?._id.toString();
    const lastMessageSenderName = conversation.lastMsg?.sender?.name || "";
    const messageText = conversation.lastMsg?.content || "";

    // Determine display message
    let displayMessage;
    if (conversation.isGroup) {
      displayMessage = messageText
        ? lastMessageSenderId === userId
          ? `You: ${messageText}`
          : messageText
        : `${conversation.createdBy.name} created a new group`;
    } else {
      displayMessage =
        lastMessageSenderId === userId ? `You: ${messageText}` : messageText;
    }

    // Format conversation details
    const formattedConversation = {
      id: conversation._id,
      createdBy: conversation.createdBy,
      createdAt: conversation.createdAt,
      name: conversation.isGroup
        ? conversation.groupName || "Default Group Chat"
        : otherParticipant?.name,
      message: displayMessage,
      time: conversation.lastMsg ? conversation.lastMsg.createdAt : "",
      alertCount: conversation.messages?.length || 0,
      status: conversation.pinned,
      profilePic: conversation.isGroup
        ? conversation.profilePic || null
        : otherParticipant?.profilePic || null,
      pinned: conversation.pinned,
      isGroup: conversation.isGroup,
      lastMessageSender: lastMessageSenderName || null,
      groupMembers: conversation.isGroup ? conversation.participants : null,
      lastLogin: otherParticipant.lastLogin,
    };

    res.status(200).json(formattedConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getParticipantsInGroup = async (req, res) => {
  const { conversationId } = req.query;
  try {
    // Retrieve the conversation by ID
    const conversation = await Conversation.findById(conversationId).populate(
      "participants"
    );

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Get IDs of current participants in the conversation
    const participantIds = conversation.participants.map((participant) =>
      participant._id.toString()
    );

    // Find users who are not in the participant list
    const nonParticipants = await User.find({ _id: { $nin: participantIds } });

    // Respond with non-participant users
    res.status(200).json({ nonParticipants });
  } catch (error) {
    console.error("Error fetching non-participants:", error);
    res
      .status(500)
      .json({ message: "An error occurred while fetching non-participants." });
  }
};

exports.checkOrCreateConversation = async (req, res) => {
  try {
    const { username } = req.params;
    const loggedUserId = req.user.id;

    // Check if the username is provided
    if (!username) {
      return res.status(400).json({ message: "Username is required." });
    }

    // Find the user by username
    const targetUser = await User.findOne({ username });
    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if the logged user and target user are already in a conversation
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [loggedUserId, targetUser._id] },
      createdBy: loggedUserId,
    });

    if (conversation) {
      // Conversation exists, return true with conversationId
      return res.status(200).json({
        exists: true,
        conversationId: conversation._id,
      });
    }

    // If no conversation exists, create a new one
    conversation = new Conversation({
      participants: [loggedUserId, targetUser._id],
      isGroup: false,
      messages: [],
      createdBy: loggedUserId,
    });
    await conversation.save();

    // Return the new conversation details
    return res.status(201).json({
      exists: false,
      conversationId: conversation._id,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error checking or creating conversation",
      error: error.message,
    });
  }
};

// // Function to update all "sending" messages to "sent"
// const updateMessageStatusToSent = async () => {
//   try {
//     const messages = await Message.find({ status: "sending" });
//     console.log(`Found ${messages.length} messages with "sending" status.`);

//     const result = await Message.deleteMany();

//     console.log(
//       `Successfully updated ${result.modifiedCount} messages to "sent" status.`
//     );
//   } catch (error) {
//     console.error("Error updating message status:", error);
//   }
// };

// // Run the function
// updateMessageStatusToSent();

// Function to get the last activity time for a specific user
// const getLastActivity = async (userId) => {
//   try {
//     const latestPost = await Post.findOne({ createdBy: userId })
//       .sort({ updatedAt: -1 })
//       .select("updatedAt createdAt")
//       .exec();
//     const postActivityTime = latestPost
//       ? latestPost.updatedAt || latestPost.createdAt
//       : null;

//     const latestMessage = await Message.findOne({ sender: userId })
//       .sort({ updatedAt: -1 })
//       .select("updatedAt createdAt")
//       .exec();
//     const messageActivityTime = latestMessage
//       ? latestMessage.updatedAt || latestMessage.createdAt
//       : null;

//     const latestConversation = await Conversation.findOne({
//       participants: userId,
//     })
//       .sort({ updatedAt: -1 })
//       .select("updatedAt createdAt")
//       .exec();
//     const conversationActivityTime = latestConversation
//       ? latestConversation.updatedAt || latestConversation.createdAt
//       : null;

//     const lastActivity = [
//       postActivityTime,
//       messageActivityTime,
//       conversationActivityTime,
//     ].filter(Boolean);

//     return lastActivity.length
//       ? new Date(Math.max(...lastActivity.map((d) => d.getTime())))
//       : null;
//   } catch (error) {
//     console.error("Error fetching last activity:", error);
//     return null;
//   }
// };

// const updateLastLoginForAllUsers = async () => {
//   try {
//     const users = await User.find();

//     for (const user of users) {
//       let lastActivityTime = await getLastActivity(user._id);

//       // Use `createdAt` as a fallback if no recent activity is found
//       if (!lastActivityTime) {
//         lastActivityTime = user.createdAt;
//         console.log(
//           `No recent activity for user ${user.username}, using created date: ${lastActivityTime}`
//         );
//       }

//       await User.findByIdAndUpdate(user._id, { lastLogin: lastActivityTime });
//       console.log(`Updated lastLogin for user ${user.username}`);
//     }

//     console.log("All users' lastLogin fields have been updated.");
//   } catch (error) {
//     console.error("Error updating lastLogin for all users:", error);
//   } finally {
//   }
// };

// // Run the update function
// updateLastLoginForAllUsers();
