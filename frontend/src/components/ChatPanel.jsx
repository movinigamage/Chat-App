import { useState, useEffect } from "react";
import Avatar from "./Avatar";
import { parsePhoneInput } from "../utils/phone";
import MessageArea from "./MessageArea";
import Composer from "./Composer";
import { SearchIcon, CloseIcon, ArrowLeftIcon, TrashIcon, UserPlusIcon } from "./Icons";

export default function ChatPanel({
  activeChat,
  selfPhone,
  getContactName,
  messages,
  onSendMessage,
  activeChatId,
  socket,
  typingStates = {},
  onBack,
  onDeleteChat,
  onCreateChat,
  onEditMessage,
  onDeleteMessage
}) {
  const [composerMode, setComposerMode] = useState("compose"); // "compose" | "edit" | "search"
  const [editingMessage, setEditingMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Reset states when switching chats
  useEffect(() => {
    setComposerMode("compose");
    setEditingMessage(null);
    setSearchQuery("");
  }, [activeChatId]);

  const [modalOpen, setModalOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateChat = async (e) => {
    e.preventDefault();
    const parsed = parsePhoneInput(newChatPhone);
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
      setNewChatPhone("");
      setModalOpen(false);
    } catch (err) {
      setCreateError(err.message || "Failed to create chat");
    } finally {
      setCreating(false);
    }
  };

  if (!activeChat) {
    return (
      <section className="chat-panel-empty">
        <div className="empty-state-card">
          <div className="empty-logo"></div>
          <h2>Real-Time Messenger</h2>
          <p>Select a chat from the sidebar or start a new conversation to begin messaging.</p>
          <button
            type="button"
            className="empty-chat-btn"
            onClick={() => setModalOpen(true)}
            aria-label="Start New Chat"
          >
            <UserPlusIcon size={18} style={{ marginRight: "8px" }} />
            Start New Chat
          </button>
        </div>

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
                    setNewChatPhone("");
                    setCreateError("");
                  }}
                  aria-label="Close modal"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <form onSubmit={handleCreateChat}>
                <div className="input-group">
                  <label htmlFor="modal-phone-input-empty">Phone Number (with country code)</label>
                  <input
                    id="modal-phone-input-empty"
                    type="text"
                    value={newChatPhone}
                    onChange={(e) => {
                      setNewChatPhone(e.target.value);
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
      </section>
    );
  }

  const peerPhone = activeChat.participants.find((p) => p !== selfPhone) || selfPhone;
  const peerName = getContactName(activeChat, peerPhone);
  const isPeerTyping = !!typingStates[activeChat.id];

  // Filter messages based on search query
  const filteredMessages = searchQuery.trim()
    ? messages.filter((msg) =>
      msg.text.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : messages;

  return (
    <section className="chat-panel">
      {/* Chat Header */}
      <header className="chat-panel-header">
        <div className="chat-header-user">
          <button
            type="button"
            className="action-btn back-btn"
            onClick={onBack}
            title="Back to chat list"
            aria-label="Back to chat list"
          >
            <ArrowLeftIcon size={20} />
          </button>
          <Avatar label={peerName} size={40} />
          <div className="chat-header-meta">
            <h3>{peerName}</h3>
            {isPeerTyping ? (
              <span className="typing-status">typing...</span>
            ) : (
              <span className="online-status">{peerPhone}</span>
            )}
          </div>
        </div>

        <div className="chat-header-actions">
          <button
            type="button"
            className={`action-btn ${composerMode === "search" ? "active" : ""}`}
            onClick={() => {
              if (composerMode === "search") {
                setComposerMode("compose");
                setSearchQuery("");
              } else {
                setComposerMode("search");
                setEditingMessage(null);
                setSearchQuery("");
              }
            }}
            title="Search messages"
            aria-label="Search messages"
          >
            <SearchIcon size={18} />
          </button>
        </div>
      </header>

      {/* Message Viewport */}
      <MessageArea
        messages={filteredMessages}
        selfPhone={selfPhone}
        searchQuery={searchQuery}
        onStartEdit={(msg) => {
          setComposerMode("edit");
          setEditingMessage(msg);
        }}
        onDeleteMessage={onDeleteMessage}
      />

      {/* Composer Input Area */}
      <Composer
        activeChatId={activeChat.id}
        onSendMessage={onSendMessage}
        socket={socket}
        composerMode={composerMode}
        editingMessage={editingMessage}
        onCancelMode={() => {
          setComposerMode("compose");
          setEditingMessage(null);
          setSearchQuery("");
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onEditMessage={onEditMessage}
      />
    </section>
  );
}
