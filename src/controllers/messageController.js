const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const ImageKit = require("imagekit");
const User = require("../models/User");

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
    // Fetch conversations for the logged-in user
    const userId = req.user.id;
    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name profilePic") // Fetch participant names and profilePics
      .populate("createdBy", "name profilePic") // Fetch participant names and avatars
      .populate({
        path: "lastMsg",
        select: "content createdAt",
        populate: { path: "sender" },
      })
      .sort({ createdAt: -1 }) // Fetch last message details
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
      let messageText = conv.lastMsg?.content || "";

      if (!messageText && !lastMessageSender && isGroup) {
        const creatorName = conv.createdBy.name;
        messageText = `${creatorName} created a new group`;
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
        time: conv.lastMsg ? conv.lastMsg.createdAt : "",
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
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId)
      .populate("participants", "name profilePic username isVerified")
      .populate("createdBy") // Populate members with name and profilePic
      .populate({
        path: "lastMsg",
        select: "text createdAt",
        populate: { path: "sender" },
      }); // Fetch last message details

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const lastMessageSender = conversation?.lastMsg?.sender?.name || "";

    // Check if this is a new conversation without messages
    let messageText = conversation.lastMsg?.text || "";
    if (!messageText && !lastMessageSender && conversation.isGroup) {
      const creatorName = conversation.createdBy.name;
      messageText = `${creatorName} created a new group`;
    }

    const formattedConversation = {
      id: conversation._id,
      createdBy: conversation.createdBy,
      createdAt: conversation.createdAt,
      name: conversation.isGroup
        ? conversation.groupName === ""
          ? "Default Group Chat"
          : conversation.groupName
        : conversation.participants.find((p) => p.id.toString() !== userId)
            ?.name,
      message: messageText,
      time: conversation.lastMsg ? conversation.lastMsg.createdAt : "",
      alertCount: conversation.messages ? conversation.messages.length : 0, // Assuming total messages as alert count
      status: conversation.pinned, // Assuming 'pinned' status
      profilePic: conversation.isGroup
        ? conversation.profilePic || null
        : participants.find((p) => p.id.toString() !== userId)?.profilePic,
      pinned: conversation.pinned,
      isGroup: conversation.isGroup,
      lastMessageSender: lastMessageSender || null,
      groupMembers:
        conversation.isGroup && conversation.participants.length
          ? conversation.participants
          : null,
      groupAvatars:
        conversation.isGroup && conversation.participants.length
          ? conversation.participants.slice(0, 3).map((p) => p.avatar)
          : null,
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
    const { username } = req.body;
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
    });
    await conversation.save();

    // Return the new conversation details
    res.status(201).json({
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
