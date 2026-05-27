import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import Auth from "./components/Auth";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import { playMessageSound, playSentSound } from "./components/AudioNotification";

const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

async function request(path, options = {}) {
  const { token, headers, ...fetchOptions } = options;
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...fetchOptions
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

export default function App() {
  const [selfPhone, setSelfPhone] = useState(() => localStorage.getItem("chat:selfPhone") || "");
  const [selfName, setSelfName] = useState(() => localStorage.getItem("chat:selfName") || "");
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("chat:authToken") || "");
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(() => localStorage.getItem("chat:activeChatId") || "");
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  
  // Custom features states
  const [theme, setTheme] = useState(() => localStorage.getItem("chat:theme") || "dark");
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("chat:muted") === "true");
  const [connectionState, setConnectionState] = useState("disconnected");
  const [typingStates, setTypingStates] = useState({}); // { [chatId]: phone }

  const socketRef = useRef(null);
  
  // Refs to avoid stale closures in socket callbacks
  const activeChatIdRef = useRef(activeChatId);
  const isMutedRef = useRef(isMuted);
  const selfPhoneRef = useRef(selfPhone);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    if (activeChatId) {
      localStorage.setItem("chat:activeChatId", activeChatId);
    } else {
      localStorage.removeItem("chat:activeChatId");
    }
  }, [activeChatId]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    localStorage.setItem("chat:muted", isMuted ? "true" : "false");
  }, [isMuted]);

  useEffect(() => {
    selfPhoneRef.current = selfPhone;
  }, [selfPhone]);

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("chat:theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  const toggleMute = () => setIsMuted((prev) => !prev);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) || null,
    [chats, activeChatId]
  );

  const getContactName = useCallback(
    (chat, targetPhone) => {
      if (chat?.participantNames?.[targetPhone]) {
        return chat.participantNames[targetPhone];
      }
      return targetPhone === selfPhone ? selfName : targetPhone;
    },
    [selfName, selfPhone]
  );

  const loadChats = useCallback(async () => {
    if (!selfPhone || !authToken) return;
    try {
      const data = await request("/api/chats", { token: authToken });
      setChats(data.chats);
    } catch (err) {
      setError(err.message || "Failed to load chats");
    }
  }, [selfPhone, authToken]);

  const loadMessages = useCallback(async () => {
    if (!selfPhone || !authToken || !activeChatId) return;
    try {
      const data = await request(`/api/chats/${encodeURIComponent(activeChatId)}/messages`, {
        token: authToken
      });
      setMessages(data.messages);
    } catch (err) {
      setError(err.message || "Failed to load messages");
    }
  }, [selfPhone, authToken, activeChatId]);

  // Handle connection and sockets
  useEffect(() => {
    if (!selfPhone || !authToken) return;

    setConnectionState("connecting");
    const socket = io(socketUrl, {
      transports: ["websocket"],
      auth: { token: authToken }
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionState("connected");
      setError("");
    });

    socket.on("disconnect", () => {
      setConnectionState("disconnected");
    });

    socket.on("connect_error", () => {
      setConnectionState("disconnected");
    });

    socket.on("message", (message) => {
      const isSelf = message.senderPhone === selfPhoneRef.current;
      
      if (message.chatId === activeChatIdRef.current) {
        setMessages((prev) => [...prev, message]);
      }
      
      // Play notifications
      if (isSelf) {
        playSentSound();
      } else {
        if (!isMutedRef.current) {
          playMessageSound();
        }
      }
    });

    socket.on("chat_updated", () => {
      loadChats().catch((err) => setError(err.message));
    });

    socket.on("message_edited", ({ messageId, text, isEdited }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, text, isEdited } : msg))
      );
    });

    socket.on("message_deleted_for_everyone", ({ messageId, text, isDeletedForEveryone }) => {
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === messageId);
        if (msg && msg.senderPhone === selfPhoneRef.current) {
          return prev.filter((m) => m.id !== messageId);
        }
        return prev.map((m) =>
          m.id === messageId ? { ...m, text, isDeletedForEveryone } : m
        );
      });
    });

    socket.on("message_deleted_for_me", ({ messageId }) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    });

    socket.on("user_typing", ({ chatId, phone }) => {
      setTypingStates((prev) => ({
        ...prev,
        [chatId]: phone
      }));
    });

    socket.on("user_stop_typing", ({ chatId }) => {
      setTypingStates((prev) => {
        const copy = { ...prev };
        delete copy[chatId];
        return copy;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnectionState("disconnected");
    };
  }, [selfPhone, authToken, loadChats]);

  // If a stored token is no longer valid, force login again.
  useEffect(() => {
    if (!selfPhone || !authToken) return;
    request("/api/users/me", {
      token: authToken
    }).catch(() => {
      localStorage.removeItem("chat:selfPhone");
      localStorage.removeItem("chat:selfName");
      localStorage.removeItem("chat:authToken");
      setSelfPhone("");
      setSelfName("");
      setAuthToken("");
      setChats([]);
      setActiveChatId("");
      setMessages([]);
      setError("");
    });
  }, [selfPhone, authToken]);

  // Join/leave room on active chat change
  useEffect(() => {
    if (!activeChatId || !socketRef.current) return;
    socketRef.current.emit("join_chat", { chatId: activeChatId });
    return () => {
      socketRef.current?.emit("leave_chat", { chatId: activeChatId });
    };
  }, [activeChatId]);

  // Initial load
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Load messages when active chat changes
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Auto deselect active chat if it gets deleted
  useEffect(() => {
    if (activeChatId && chats.length > 0) {
      const exists = chats.some((c) => c.id === activeChatId);
      if (!exists) {
        setActiveChatId("");
      }
    }
  }, [chats, activeChatId]);

  const handleAuthSuccess = ({ phone: userPhone, name: userName, token }) => {
    localStorage.setItem("chat:selfPhone", userPhone);
    localStorage.setItem("chat:selfName", userName || userPhone);
    localStorage.setItem("chat:authToken", token);
    setSelfPhone(userPhone);
    setSelfName(userName);
    setAuthToken(token);
  };

  const handleLogout = () => {
    localStorage.removeItem("chat:selfPhone");
    localStorage.removeItem("chat:selfName");
    localStorage.removeItem("chat:authToken");
    setSelfPhone("");
    setSelfName("");
    setAuthToken("");
    setChats([]);
    setMessages([]);
    setActiveChatId("");
    setError("");
  };

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "chat:selfPhone") {
        if (!e.newValue) {
          // Sync logout
          setSelfPhone("");
          setSelfName("");
          setAuthToken("");
          setChats([]);
          setMessages([]);
          setActiveChatId("");
          setError("");
        } else {
          // Sync login
          setSelfPhone(e.newValue);
          setSelfName(localStorage.getItem("chat:selfName") || "");
          setAuthToken(localStorage.getItem("chat:authToken") || "");
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleCreateChat = async (peerPhone) => {
    const data = await request("/api/chats", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({ peerPhone })
    });
    await loadChats();
    setActiveChatId(data.chat.id);
  };

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm("Are you sure you want to delete this chat? This will delete the conversation for you only; the other participant will keep their history.")) return;
    try {
      await request(`/api/chats/${encodeURIComponent(chatId)}`, {
        method: "DELETE",
        token: authToken
      });
      if (activeChatIdRef.current === chatId) {
        setActiveChatId("");
      }
      await loadChats();
    } catch (err) {
      setError(err.message || "Failed to delete chat");
    }
  };

  const handleSendMessage = (text) => {
    if (!activeChatId || !socketRef.current) return;
    socketRef.current.emit("send_message", {
      chatId: activeChatId,
      text
    });
  };

  const handleEditMessage = (messageId, text) => {
    if (!socketRef.current) return;
    socketRef.current.emit("edit_message", { messageId, text });
  };

  const handleDeleteMessage = (messageId, type) => {
    if (!socketRef.current) return;
    socketRef.current.emit("delete_message", { messageId, type });
  };

  // Auth screen
  if (!selfPhone) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <main className="app-container">
      <div className={`chat-layout ${activeChatId ? "has-active-chat" : ""}`}>
        <Sidebar
          selfName={selfName}
          selfPhone={selfPhone}
          onLogout={handleLogout}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={setActiveChatId}
          onCreateChat={handleCreateChat}
          getContactName={getContactName}
          typingStates={typingStates}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          theme={theme}
          onToggleTheme={toggleTheme}
          connectionState={connectionState}
          onDeleteChat={handleDeleteChat}
        />
        
        <ChatPanel
          activeChat={activeChat}
          selfPhone={selfPhone}
          getContactName={getContactName}
          messages={messages}
          onSendMessage={handleSendMessage}
          activeChatId={activeChatId}
          socket={socketRef.current}
          typingStates={typingStates}
          onBack={() => setActiveChatId("")}
          onDeleteChat={handleDeleteChat}
          onCreateChat={handleCreateChat}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      </div>
      {error && <div className="floating-error-toast">{error}</div>}
    </main>
  );
}
