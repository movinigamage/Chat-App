import { useState, useRef, useEffect } from "react";
import Avatar from "./Avatar";
import { parsePhoneInput } from "../utils/phone";
import {
  LogOutIcon,
  SearchIcon,
  UserPlusIcon,
  Volume2Icon,
  VolumeXIcon,
  SunIcon,
  MoonIcon,
  CloseIcon,
  TrashIcon
} from "./Icons";

function formatLastMessageTime(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diffTime = today - msgDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return new Intl.DateTimeFormat([], { weekday: "short" }).format(date);
    } else {
      return new Intl.DateTimeFormat([], { month: "short", day: "numeric" }).format(date);
    }
  } catch (err) {
    return "";
  }
}

export default function Sidebar({
  selfName,
  selfPhone,
  onLogout,
  chats,
  activeChatId,
  onSelectChat,
  onCreateChat,
  getContactName,
  typingStates = {},
  isMuted,
  onToggleMute,
  theme,
  onToggleTheme,
  connectionState,
  onDeleteChat
}) {
  const [peerPhone, setPeerPhone] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // Swipe to delete states
  const [swipeState, setSwipeState] = useState({}); // { [chatId]: offsetPx }
  const [isDragging, setIsDragging] = useState({}); // { [chatId]: boolean }

  // Clear swipe states for chats that are no longer in the chats list
  useEffect(() => {
    const chatIds = new Set(chats.map(c => c.id));
    setSwipeState(prev => {
      let changed = false;
      const clean = { ...prev };
      Object.keys(clean).forEach(key => {
        if (!chatIds.has(key)) {
          delete clean[key];
          changed = true;
        }
      });
      return changed ? clean : prev;
    });
  }, [chats]);

  // Reset swipe state for active chat when it changes
  useEffect(() => {
    if (activeChatId) {
      setSwipeState(prev => {
        if (prev[activeChatId] !== 0 && prev[activeChatId] !== undefined) {
          return { ...prev, [activeChatId]: 0 };
        }
        return prev;
      });
    }
  }, [activeChatId]);

  const dragStart = useRef({ x: 0, currentOffset: 0 });
  const activeDragChatId = useRef(null);
  const dragDistance = useRef(0);

  const MAX_SWIPE = -70; // Width of delete button
  const SWIPE_THRESHOLD = -35;

  const handleTouchStart = (e, chatId) => {
    // Reset all other swipes
    setSwipeState(prev => {
      const reset = {};
      Object.keys(prev).forEach(key => {
        if (key !== chatId) reset[key] = 0;
        else reset[key] = prev[key];
      });
      return reset;
    });

    const touch = e.touches[0];
    dragStart.current = {
      x: touch.clientX,
      currentOffset: swipeState[chatId] || 0
    };
    activeDragChatId.current = chatId;
    setIsDragging(prev => ({ ...prev, [chatId]: true }));
    dragDistance.current = 0;
  };

  const handleTouchMove = (e, chatId) => {
    if (activeDragChatId.current !== chatId) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - dragStart.current.x;
    let newOffset = dragStart.current.currentOffset + diffX;

    if (newOffset > 0) newOffset = 0;
    if (newOffset < MAX_SWIPE) {
      newOffset = MAX_SWIPE + (newOffset - MAX_SWIPE) * 0.2;
    }

    dragDistance.current = Math.abs(diffX);
    setSwipeState(prev => ({ ...prev, [chatId]: newOffset }));
  };

  const handleTouchEnd = (e, chatId) => {
    if (activeDragChatId.current !== chatId) return;
    activeDragChatId.current = null;
    setIsDragging(prev => ({ ...prev, [chatId]: false }));

    const wasOpen = dragStart.current.currentOffset === MAX_SWIPE;
    const touch = e.changedTouches[0];
    const diffX = touch ? touch.clientX - dragStart.current.x : 0;

    if (wasOpen) {
      // If it was already open, swiping left again (diffX < -15) or swiping right (diffX > 15) unlocks/closes it
      if (diffX < -15 || diffX > 15) {
        setSwipeState(prev => ({ ...prev, [chatId]: 0 }));
      } else {
        setSwipeState(prev => ({ ...prev, [chatId]: MAX_SWIPE }));
      }
    } else {
      // If it was closed, swiping left past the threshold opens and locks it
      if (diffX < SWIPE_THRESHOLD) {
        setSwipeState(prev => ({ ...prev, [chatId]: MAX_SWIPE }));
      } else {
        setSwipeState(prev => ({ ...prev, [chatId]: 0 }));
      }
    }
  };

  const handleMouseDown = (e, chatId) => {
    if (window.innerWidth > 768) return; // Disable drag-swipe on desktop
    if (e.button !== 0) return;

    // Reset all other swipes
    setSwipeState(prev => {
      const reset = {};
      Object.keys(prev).forEach(key => {
        if (key !== chatId) reset[key] = 0;
        else reset[key] = prev[key];
      });
      return reset;
    });

    dragStart.current = {
      x: e.clientX,
      currentOffset: swipeState[chatId] || 0
    };
    activeDragChatId.current = chatId;
    setIsDragging(prev => ({ ...prev, [chatId]: true }));
    dragDistance.current = 0;

    const handleMouseMove = (moveEvent) => {
      const diffX = moveEvent.clientX - dragStart.current.x;
      let newOffset = dragStart.current.currentOffset + diffX;
      if (newOffset > 0) newOffset = 0;
      if (newOffset < MAX_SWIPE) {
        newOffset = MAX_SWIPE + (newOffset - MAX_SWIPE) * 0.2;
      }
      dragDistance.current = Math.abs(diffX);
      setSwipeState(prev => ({ ...prev, [chatId]: newOffset }));
    };

    const handleMouseUp = (upEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      activeDragChatId.current = null;
      setIsDragging(prev => ({ ...prev, [chatId]: false }));

      const wasOpen = dragStart.current.currentOffset === MAX_SWIPE;
      const diffX = upEvent.clientX - dragStart.current.x;

      if (wasOpen) {
        // If it was already open, swiping left again (diffX < -15) or swiping right (diffX > 15) unlocks/closes it
        if (diffX < -15 || diffX > 15) {
          setSwipeState(prev => ({ ...prev, [chatId]: 0 }));
        } else {
          setSwipeState(prev => ({ ...prev, [chatId]: MAX_SWIPE }));
        }
      } else {
        // If it was closed, swiping left past threshold opens and locks it
        if (diffX < SWIPE_THRESHOLD) {
          setSwipeState(prev => ({ ...prev, [chatId]: MAX_SWIPE }));
        } else {
          setSwipeState(prev => ({ ...prev, [chatId]: 0 }));
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleItemClick = (e, chatId) => {
    if (dragDistance.current > 5) {
      e.preventDefault();
      return;
    }
    if (swipeState[chatId] < -10) {
      setSwipeState(prev => ({ ...prev, [chatId]: 0 }));
      return;
    }
    onSelectChat(chatId);
  };

  const handleCreateChat = async (e) => {
    e.preventDefault();
    const parsed = parsePhoneInput(peerPhone);
    if (!parsed.ok) {
      setCreateError(parsed.error);
      return;
    }
    if (parsed.phone === selfPhone) {
      setCreateError("Cannot chat with yourself");
      return;
    }

    setCreateError("");
    setCreating(true);

    try {
      await onCreateChat(parsed.phone);
      setPeerPhone("");
      setModalOpen(false);
    } catch (err) {
      setCreateError(err.message || "Failed to create chat");
    } finally {
      setCreating(false);
    }
  };

  const filteredChats = chats.filter((chat) => {
    const peer = chat.participants.find((p) => p !== selfPhone) || selfPhone;
    const peerName = getContactName(chat, peer);
    const searchLower = chatSearch.toLowerCase();
    return (
      peerName.toLowerCase().includes(searchLower) ||
      peer.toLowerCase().includes(searchLower) ||
      (chat.lastMessage && chat.lastMessage.toLowerCase().includes(searchLower))
    );
  });

  return (
    <aside className="sidebar-panel">
      {/* Sidebar Header */}
      <header className="sidebar-header">
        <div className="sidebar-profile">
          <Avatar label={selfName || selfPhone} size={42} />
          <div className="profile-details">
            <h3>{selfName || selfPhone}</h3>
            <p className="profile-phone">{selfPhone}</p>
          </div>
        </div>

        <div className="sidebar-actions">
          {/* Theme Toggle */}
          <button
            type="button"
            className="action-btn"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            className="action-btn"
            onClick={onToggleMute}
            title={isMuted ? "Unmute Sounds" : "Mute Sounds"}
            aria-label="Toggle sounds"
          >
            {isMuted ? <VolumeXIcon size={18} /> : <Volume2Icon size={18} />}
          </button>

          {/* Logout Button */}
          <button
            type="button"
            className="action-btn logout-btn"
            onClick={() => setLogoutConfirmOpen(true)}
            title="Logout"
            aria-label="Logout"
          >
            <LogOutIcon size={18} />
          </button>
        </div>
      </header>

      {/* Network Status Banner */}
      {connectionState !== "connected" && (
        <div className={`network-banner ${connectionState}`} role="status">
          <span className="network-dot"></span>
          <span>{connectionState === "connecting" ? "Reconnecting to server..." : "Disconnected from server"}</span>
        </div>
      )}

      {/* New Chat Section */}
      <section className="sidebar-section new-chat-section">
        <form onSubmit={handleCreateChat} className="new-chat-form">
          <div className="new-chat-input-wrapper">
            <input
              type="text"
              value={peerPhone}
              onChange={(e) => {
                setPeerPhone(e.target.value);
                if (createError) setCreateError("");
              }}
              placeholder="e.g. +14155552671"
              disabled={creating}
              required
            />
            <button type="submit" className="new-chat-btn" disabled={creating} aria-label="Start chat">
              <UserPlusIcon size={18} />
            </button>
          </div>
          {createError && <p className="sidebar-error-text">{createError}</p>}
        </form>
      </section>

      {/* Search Chats Section */}
      <section className="sidebar-section search-chats-section">
        <div className="search-input-wrapper">
          <SearchIcon size={16} className="search-input-icon" />
          <input
            type="text"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Search chats or messages..."
          />
        </div>
      </section>

      {/* Chat List Section */}
      <section className="chat-list-container">
        {filteredChats.length === 0 ? (
          <div className="no-chats-state">
            <p>{chatSearch ? "No matching chats found" : "No chats yet."}</p>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const peer = chat.participants.find((p) => p !== selfPhone) || selfPhone;
            const peerName = getContactName(chat, peer);
            const isActive = chat.id === activeChatId;
            const isPeerTyping = !!typingStates[chat.id];

            return (
              <div key={chat.id} className="chat-item-swipe-container">
                {/* Delete button behind foreground */}
                <button
                  type="button"
                  className="chat-item-delete-btn"
                  style={{
                    opacity: swipeState[chat.id] ? 1 : 0,
                    pointerEvents: swipeState[chat.id] ? "auto" : "none",
                    transition: "opacity 0.2s ease"
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  title="Delete Chat"
                  aria-label="Delete Chat"
                >
                  <TrashIcon size={20} />
                </button>

                <div
                  className={`chat-item-btn ${isActive ? "active" : ""}`}
                  onClick={(e) => handleItemClick(e, chat.id)}
                  style={{
                    transform: `translateX(${swipeState[chat.id] || 0}px)`,
                    transition: isDragging[chat.id] ? "none" : "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                  }}
                  onTouchStart={(e) => handleTouchStart(e, chat.id)}
                  onTouchMove={(e) => handleTouchMove(e, chat.id)}
                  onTouchEnd={(e) => handleTouchEnd(e, chat.id)}
                  onMouseDown={(e) => handleMouseDown(e, chat.id)}
                >
                  <Avatar label={peerName} size={44} />

                  <div className="chat-item-info">
                    <div className="chat-item-header">
                      <span className="chat-item-name">{peerName}</span>
                      {chat.lastMessageAt && (
                        <span className="chat-item-time">
                          {formatLastMessageTime(chat.lastMessageAt)}
                        </span>
                      )}
                    </div>

                    <div className="chat-item-body">
                      {isPeerTyping ? (
                        <span className="typing-indicator-text">typing...</span>
                      ) : (
                        <span className="chat-item-message">
                          {chat.lastMessage || "No messages yet"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Desktop hover delete button */}
                  {!swipeState[chat.id] && (
                    <button
                      type="button"
                      className="chat-item-hover-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      title="Delete Chat"
                    >
                      <TrashIcon size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Floating Action Button (Visible on Mobile) */}
      <button
        type="button"
        className="fab-btn"
        onClick={() => setModalOpen(true)}
        title="Start New Chat"
        aria-label="Start New Chat"
      >
        <UserPlusIcon size={24} />
      </button>

      {/* New Chat Modal Popup */}
      {modalOpen && (
        <div className="modal-overlay pop-up">
          <div className="modal-card">
            <div className="modal-header">
              <h3>New Conversation</h3>
              <button
                type="button"
                className="action-btn close-modal-btn"
                onClick={() => {
                  setModalOpen(false);
                  setPeerPhone("");
                  setCreateError("");
                }}
                aria-label="Close modal"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateChat}>

              <div className="input-group">
                <label htmlFor="modal-phone-input">Phone Number (with country code)</label>
                <input
                  id="modal-phone-input"
                  type="text"
                  value={peerPhone}
                  onChange={(e) => {
                    setPeerPhone(e.target.value);
                    if (createError) setCreateError("");
                  }}
                  placeholder="e.g. +14155552671"
                  disabled={creating}
                  required
                  autoFocus
                />
              </div>
              {createError && <p className="modal-error-text">{createError}</p>}
              <button type="submit" className="modal-submit-btn" disabled={creating}>
                {creating ? "Connecting..." : "Start Chat"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {logoutConfirmOpen && (
        <div className="modal-overlay pop-up">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Logout</h3>
              <button
                type="button"
                className="action-btn close-modal-btn"
                onClick={() => setLogoutConfirmOpen(false)}
                aria-label="Close modal"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="modal-body-text">
              <p>Are you sure you want to log out?</p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={() => setLogoutConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-submit-btn logout-confirm-btn"
                onClick={onLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
