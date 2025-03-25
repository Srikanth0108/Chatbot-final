import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
} from "react";
import { AuthContext } from "./AuthContext";
import { saveToLocalStorage, getFromLocalStorage } from "../utils/localStorage";
import { sendChatMessage, getUserConversations } from "../services/chatService";
import { v4 as uuidv4 } from "uuid";

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const { currentUser, isAuthenticated } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState("");
  const [abortController, setAbortController] = useState(null);
  // Track which conversation is currently processing a response
  const [processingConversationId, setProcessingConversationId] =
    useState(null);
  // Track message statuses per conversation
  const [conversationMessages, setConversationMessages] = useState({});
  // Add a loading screen state
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);

  // Load conversations when user is authenticated
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      loadUserConversations();
    } else {
      // Clear conversations if user is not authenticated
      setConversations([]);
      setActiveConversation(null);
      setConversationMessages({});
    }
  }, [isAuthenticated, currentUser]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversation) {
      loadConversationMessages(activeConversation.id);

      // Update loading state based on whether this conversation is being processed
      setIsLoading(processingConversationId === activeConversation.id);
    } else {
      setMessages([]);
      setIsLoading(false);
    }
  }, [activeConversation, processingConversationId]);

  const setActiveConversationWithStorage = useCallback(
    (conversation) => {
      // Don't update if we're already on this conversation
      if (activeConversation?.id === conversation.id) return;

      // Check if we're switching from a processing conversation

      // If there are cached messages for this conversation, set them immediately
      if (conversationMessages[conversation.id]) {
        setMessages(conversationMessages[conversation.id]);
      } else {
        setMessages([]); // Clear messages until we load the new ones
      }

      setActiveConversation(conversation);
      // Update loading state based on whether the new conversation is being processed
      setIsLoading(processingConversationId === conversation.id);

      if (currentUser && conversation) {
        localStorage.setItem(
          `${currentUser.id}_activeConversation`,
          conversation.id
        );
      }
    },
    [
      activeConversation,
      currentUser,
      processingConversationId,
      conversationMessages,
    ]
  );

  const loadUserConversations = async () => {
    try {
      const storageKey = `${currentUser.id}_conversations`;
      const storedConversations = getFromLocalStorage(storageKey) || [];

      // Sort conversations by timestamp (newest first)
      const sortedConversations = [...storedConversations].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      setConversations(sortedConversations);

      // Get the stored active conversation ID
      const activeConvId = localStorage.getItem(
        `${currentUser.id}_activeConversation`
      );

      if (
        activeConvId &&
        sortedConversations.some((conv) => conv.id === activeConvId)
      ) {
        // Find and set the active conversation
        const activeConv = sortedConversations.find(
          (conv) => conv.id === activeConvId
        );
        setActiveConversation(activeConv);
        // Update loading state based on whether this conversation is being processed
        setIsLoading(processingConversationId === activeConv.id);
      } else if (sortedConversations.length > 0) {
        // Fall back to the first conversation if stored ID not found
        setActiveConversation(sortedConversations[0]);
        // Update loading state based on whether this conversation is being processed
        setIsLoading(processingConversationId === sortedConversations[0].id);
      } else {
        // Create a new conversation if none exist
        createNewConversation();
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
    }
  };

  const loadConversationMessages = async (conversationId) => {
    try {
      // For this example, we'll use local storage
      const storageKey = `${currentUser.id}_messages_${conversationId}`;
      const storedMessages = getFromLocalStorage(storageKey) || [];

      // Update both the current messages and the cached messages
      setMessages(storedMessages);
      setConversationMessages((prev) => ({
        ...prev,
        [conversationId]: storedMessages,
      }));

      // Find the last user message if any
      const userMessages = storedMessages.filter(
        (msg) => msg.sender === "user"
      );
      if (userMessages.length > 0) {
        setLastUserMessage(userMessages[userMessages.length - 1].content);
      } else {
        setLastUserMessage("");
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const createNewConversation = (baseConversations = null) => {
    const newConversation = {
      id: uuidv4(),
      title: "New Conversation",
      timestamp: new Date().toISOString(),
      userId: currentUser?.id,
    };

    // Use the provided base or the current state
    const updatedConversations = [
      newConversation,
      ...(baseConversations || conversations),
    ];
    setConversations(updatedConversations);
    setActiveConversation(newConversation);

    // Clear messages for the new conversation
    setMessages([]);
    setConversationMessages((prev) => ({
      ...prev,
      [newConversation.id]: [],
    }));

    setLastUserMessage("");
    setIsLoading(false);

    // Save to local storage
    if (currentUser) {
      const storageKey = `${currentUser.id}_conversations`;
      saveToLocalStorage(storageKey, updatedConversations);
      localStorage.setItem(
        `${currentUser.id}_activeConversation`,
        newConversation.id
      );
    }
  };

  const updateConversationTitle = useCallback(
    (conversationId, firstMessage) => {
      if (!firstMessage) return;

      // Create a title from the first message (truncate if needed)
      const title =
        firstMessage.length > 20
          ? `${firstMessage.substring(0, 20)}...`
          : firstMessage;

      // Update conversations in state
      setConversations((prevConversations) => {
        const updatedConversations = prevConversations.map((conv) =>
          conv.id === conversationId ? { ...conv, title } : conv
        );

        // Save to local storage
        if (currentUser) {
          const storageKey = `${currentUser.id}_conversations`;
          saveToLocalStorage(storageKey, updatedConversations);
        }

        return updatedConversations;
      });

      // Update active conversation if it's the one being edited
      setActiveConversation((prev) => {
        if (prev?.id === conversationId) {
          return { ...prev, title };
        }
        return prev;
      });
    },
    [currentUser]
  );

  const sendMessage = async (content) => {
    if (!content.trim()) return;

    if (!activeConversation) {
      createNewConversation();
      return;
    }

    // If there's already a conversation being processed, abort it
      const currentConversationId = activeConversation.id;

      // If there's already a conversation being processed, abort it
      // but do it quietly without resetting loading states
      if (
        processingConversationId !== null &&
        processingConversationId !== currentConversationId &&
        abortController
      ) {
        console.log(
          `Quietly aborting previous conversation: ${processingConversationId}`
        );
        abortController.abort();
        setShowLoadingScreen(true);
        setTimeout(() => {
          setShowLoadingScreen(false);
        }, 500);
        // Don't reset processing ID or loading state yet - we'll do that in the finally block of the conversation
        // loading state
      }

    // Set this conversation as processing
    setProcessingConversationId(currentConversationId);

    // Create a new AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    // Only set isLoading to true if we're viewing the conversation being processed
    if (activeConversation.id === currentConversationId) {
      setIsLoading(true);
    }

    setLastUserMessage(content);

    try {
      // Get the preferred language from localStorage
      const preferredLanguage =
        localStorage.getItem("preferredLanguage") || "en";

      // Add user message
      const userMessage = {
        id: uuidv4(),
        content,
        sender: "user",
        timestamp: new Date().toISOString(),
      };

      // Get current messages for this conversation (from cache or state)
      const currentConversationMessages =
        currentConversationId === activeConversation.id
          ? messages
          : conversationMessages[currentConversationId] || [];

      const updatedMessages = [...currentConversationMessages, userMessage];

      // Update the timestamp of the conversation
      const updatedConversations = conversations.map((conv) =>
        conv.id === currentConversationId
          ? { ...conv, timestamp: new Date().toISOString() }
          : conv
      );

      // Sort conversations by timestamp (newest first)
      const sortedConversations = [...updatedConversations].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      setConversations(sortedConversations);

      // Save updated conversations to local storage
      if (currentUser) {
        const storageKey = `${currentUser.id}_conversations`;
        saveToLocalStorage(storageKey, sortedConversations);
      }

      // If this is the first message, update conversation title
      if (currentConversationMessages.length === 0) {
        updateConversationTitle(currentConversationId, content);
      }

      // Save messages to local storage
      if (currentUser) {
        const storageKey = `${currentUser.id}_messages_${currentConversationId}`;
        saveToLocalStorage(storageKey, updatedMessages);
      }

      // Update UI and message cache
      setConversationMessages((prev) => ({
        ...prev,
        [currentConversationId]: updatedMessages,
      }));

      // Update visible messages if we're still on the same conversation
      if (activeConversation?.id === currentConversationId) {
        setMessages(updatedMessages);
      }

      // Send message to backend with conversation history and language preference
      const response = await sendChatMessage(
        currentConversationId,
        content,
        currentConversationMessages, // Pass the existing messages as history
        preferredLanguage, // Pass the language preference
        controller.signal // Pass the AbortController signal
      );

      // Add AI response
      const aiMessage = {
        id: uuidv4(),
        content: response.message,
        sender: "ai",
        timestamp: new Date().toISOString(),
        language: preferredLanguage,
        dataframe: response.dataframe,
        visualization: response.visualization
      };

      const finalMessages = [...updatedMessages, aiMessage];

      // Save updated messages to local storage
      if (currentUser) {
        const storageKey = `${currentUser.id}_messages_${currentConversationId}`;
        saveToLocalStorage(storageKey, finalMessages);
      }

      // Update the message cache
      setConversationMessages((prev) => ({
        ...prev,
        [currentConversationId]: finalMessages,
      }));

      // Update UI only if we're still on the same conversation
      if (activeConversation?.id === currentConversationId) {
        setMessages(finalMessages);
      }
    } catch (error) {
      // Don't show error message if the request was aborted
      if (error.name !== "AbortError") {
        console.error("Error sending message:", error);

        // Add error message
        const errorMessage = {
          id: uuidv4(),
          content: "Sorry, I couldn't process your request. Please try again.",
          sender: "ai",
          timestamp: new Date().toISOString(),
          isError: true,
        };

        // Get the current messages from local storage
        if (currentUser) {
          const storageKey = `${currentUser.id}_messages_${currentConversationId}`;
          const storedMessages = getFromLocalStorage(storageKey) || [];
          const updatedMessages = [...storedMessages, errorMessage];

          // Save to local storage
          saveToLocalStorage(storageKey, updatedMessages);

          // Update message cache
          setConversationMessages((prev) => ({
            ...prev,
            [currentConversationId]: updatedMessages,
          }));

          // Update UI only if we're still on the same conversation
          if (activeConversation?.id === currentConversationId) {
            setMessages(updatedMessages);
          }
        }
      }
    } finally {
      // Clear the processing state
      setProcessingConversationId(null);
      setAbortController(null);

      // Clear the loading state if we're still on the same conversation
      if (activeConversation?.id === currentConversationId) {
        setIsLoading(false);
      }
    }
  };

  const stopResponse = () => {
    if (abortController) {
      abortController.abort();
      if (
        activeConversation &&
        processingConversationId === activeConversation.id
      ) {
        setIsLoading(false);
      }
      setAbortController(null);
      setProcessingConversationId(null);
    }
  };

  const regenerateResponse = async (messageId) => {
    // Find the message to regenerate
    const messageIndex = messages.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1 || messages[messageIndex].sender !== "ai") {
      return;
    }

    // Store the conversation ID we're currently processing
    const currentConversationId = activeConversation.id;

    // Set this conversation as processing
    setProcessingConversationId(currentConversationId);

    // Create a new AbortController for this request
    const controller = new AbortController();
    setAbortController(controller);

    // Only set isLoading to true if we're viewing the conversation being processed
    if (activeConversation.id === currentConversationId) {
      setIsLoading(true);
    }

    try {
      // Find the corresponding user message that came before this AI message
      let userMessageIndex = messageIndex - 1;
      while (
        userMessageIndex >= 0 &&
        messages[userMessageIndex].sender !== "user"
      ) {
        userMessageIndex--;
      }

      if (userMessageIndex < 0) {
        throw new Error("No user message found before this AI response");
      }

      const userMessage = messages[userMessageIndex];
      const userMessageContent = userMessage.content;

      // If regenerating a message that's not the last one, remove all subsequent messages
      let updatedMessages;
      if (messageIndex < messages.length - 1) {
        updatedMessages = messages.slice(0, messageIndex);
      } else {
        // Just remove the last AI message if it's the last one in the conversation
        updatedMessages = messages.filter((msg) => msg.id !== messageId);
      }

      // Update the timestamp of the conversation
      const updatedConversations = conversations.map((conv) =>
        conv.id === currentConversationId
          ? { ...conv, timestamp: new Date().toISOString() }
          : conv
      );

      // Sort conversations by timestamp (newest first)
      const sortedConversations = [...updatedConversations].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      setConversations(sortedConversations);

      // Save updated conversations to local storage
      if (currentUser) {
        const storageKey = `${currentUser.id}_conversations`;
        saveToLocalStorage(storageKey, sortedConversations);
      }

      // Save to local storage
      if (currentUser) {
        const storageKey = `${currentUser.id}_messages_${currentConversationId}`;
        saveToLocalStorage(storageKey, updatedMessages);
      }

      // Update message cache
      setConversationMessages((prev) => ({
        ...prev,
        [currentConversationId]: updatedMessages,
      }));

      // Update UI only if we're still on the same conversation
      if (activeConversation?.id === currentConversationId) {
        setMessages(updatedMessages);
      }

      // Get the preferred language from localStorage
      const preferredLanguage =
        localStorage.getItem("preferredLanguage") || "en";

      // Send the corresponding user message to get a new AI response
      const response = await sendChatMessage(
        currentConversationId,
        userMessageContent,
        updatedMessages.slice(0, userMessageIndex), // Pass the conversation history up to this point
        preferredLanguage,
        controller.signal
      );

      // Add the new AI response
      const newAiMessage = {
        id: uuidv4(),
        content: response.message,
        sender: "ai",
        timestamp: new Date().toISOString(),
        language: preferredLanguage,
        dataframe: response.dataframe,
        visualization: response.visualization
      };

      const finalMessages = [...updatedMessages, newAiMessage];

      // Save updated messages to local storage
      if (currentUser) {
        const storageKey = `${currentUser.id}_messages_${currentConversationId}`;
        saveToLocalStorage(storageKey, finalMessages);
      }

      // Update message cache
      setConversationMessages((prev) => ({
        ...prev,
        [currentConversationId]: finalMessages,
      }));

      // Update UI only if we're still on the same conversation
      if (activeConversation?.id === currentConversationId) {
        setMessages(finalMessages);
        setLastUserMessage(userMessageContent);
      }
    } catch (error) {
      // Don't show error message if the request was aborted
      if (error.name !== "AbortError") {
        console.error("Error regenerating response:", error);

        // Add error message
        const errorMessage = {
          id: uuidv4(),
          content: "Sorry, I couldn't regenerate a response. Please try again.",
          sender: "ai",
          timestamp: new Date().toISOString(),
          isError: true,
        };

        // Get the current messages from local storage
        if (currentUser) {
          const storageKey = `${currentUser.id}_messages_${currentConversationId}`;
          const storedMessages = getFromLocalStorage(storageKey) || [];
          const updatedMessages = [...storedMessages, errorMessage];

          // Save to local storage
          saveToLocalStorage(storageKey, updatedMessages);

          // Update message cache
          setConversationMessages((prev) => ({
            ...prev,
            [currentConversationId]: updatedMessages,
          }));

          // Update UI only if we're still on the same conversation
          if (activeConversation?.id === currentConversationId) {
            setMessages(updatedMessages);
          }
        }
      }
    } finally {
      // Clear the processing state
      setProcessingConversationId(null);
      setAbortController(null);

      // Clear the loading state if we're still on the same conversation
      if (activeConversation?.id === currentConversationId) {
        setIsLoading(false);
      }
    }
  };

  const provideMessageFeedback = (messageId, isPositive) => {
    // Find the message to provide feedback for
    const messageToRate = messages.find((msg) => msg.id === messageId);
    if (!messageToRate || messageToRate.sender !== "ai") {
      return;
    }

    // In a real app, you would send this feedback to your backend
    console.log(
      `Feedback for message ${messageId}: ${isPositive ? "Good" : "Bad"}`
    );

    // Update the message with feedback status
    const updatedMessages = messages.map((msg) =>
      msg.id === messageId
        ? { ...msg, feedback: isPositive ? "positive" : "negative" }
        : msg
    );

    setMessages(updatedMessages);

    // Update message cache
    if (activeConversation) {
      setConversationMessages((prev) => ({
        ...prev,
        [activeConversation.id]: updatedMessages,
      }));
    }

    // Save to local storage
    if (currentUser && activeConversation) {
      const storageKey = `${currentUser.id}_messages_${activeConversation.id}`;
      saveToLocalStorage(storageKey, updatedMessages);
    }
  };

  const deleteConversation = (conversationId) => {
    // If this conversation is being processed, abort it
    if (processingConversationId === conversationId && abortController) {
      abortController.abort();
      setAbortController(null);
      setProcessingConversationId(null);
    }

    // Get the conversation before removing it (for logging)
    const convToDelete = conversations.find(
      (conv) => conv.id === conversationId
    );
    if (convToDelete) {
      console.log(
        `Deleting conversation: ${convToDelete.title} (${convToDelete.id})`
      );
    }

    // Make a copy of the current conversations excluding the one to delete
    const updatedConversations = conversations.filter(
      (conv) => conv.id !== conversationId
    );

    // Update state
    setConversations(updatedConversations);

    // Remove from message cache
    setConversationMessages((prev) => {
      const newCache = { ...prev };
      delete newCache[conversationId];
      return newCache;
    });

    // If active conversation is deleted, set active to the next one or null
    if (activeConversation?.id === conversationId) {
      const nextConversation =
        updatedConversations.length > 0 ? updatedConversations[0] : null;

      if (nextConversation) {
        setActiveConversation(nextConversation);
        // Update loading state for the new active conversation
        setIsLoading(processingConversationId === nextConversation.id);
        // Load messages for the new active conversation
        loadConversationMessages(nextConversation.id);
        // Also update in local storage
        if (currentUser) {
          localStorage.setItem(
            `${currentUser.id}_activeConversation`,
            nextConversation.id
          );
        }
      } else {
        setActiveConversation(null);
        setIsLoading(false);
        setMessages([]);
        // Remove from local storage
        if (currentUser) {
          localStorage.removeItem(`${currentUser.id}_activeConversation`);
        }
      }
    }

    // Remove from local storage
    if (currentUser) {
      localStorage.removeItem(`${currentUser.id}_messages_${conversationId}`);
      const storageKey = `${currentUser.id}_conversations`;
      saveToLocalStorage(storageKey, updatedConversations);
    }

    // If no conversations left, create a new one
    if (updatedConversations.length === 0) {
      createNewConversation([]);
    }
  };

  const deleteAllConversations = () => {
    // If any conversation is being processed, abort it
    if (processingConversationId && abortController) {
      abortController.abort();
      setAbortController(null);
      setProcessingConversationId(null);
    }

    // Clear all conversations from state
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setConversationMessages({});
    setIsLoading(false);

    // Clear all related data from localStorage
    if (currentUser) {
      // Find and remove all conversation-related data for this user
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(`${currentUser.id}_`)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));

      // Create a new empty conversation
      createNewConversation([]);
    }
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        conversations,
        activeConversation,
        isLoading,
        setActiveConversation: setActiveConversationWithStorage,
        sendMessage,
        createNewConversation,
        deleteConversation,
        deleteAllConversations,
        regenerateResponse,
        provideMessageFeedback,
        stopResponse,
        // Expose processing state for UI indicators
        processingConversationId,
        // Expose loading screen state
        showLoadingScreen,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export default ChatProvider;