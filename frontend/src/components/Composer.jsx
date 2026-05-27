import { useState, useRef, useEffect } from "react";
import { SendIcon, SmileIcon } from "./Icons";

const EMOJIS = ["😀", "😂", "😍", "👍", "🔥", "❤️", "🎉", "🙌", "😮", "😢", "👏", "🚀", "✨", "🤔", "👀"];

export default function Composer({
  activeChatId,
  onSendMessage,
  socket,
  composerMode = "compose",
  editingMessage = null,
  onCancelMode,
  searchQuery = "",
  onSearchChange,
  onEditMessage
}) {
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const inputRef = useRef(null);
  const emojiPanelRef = useRef(null);

  // Focus input on active chat change
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    setText("");
    isTypingRef.current = false;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, [activeChatId]);

  // Set input text when entering edit mode, or clear when going to compose
  useEffect(() => {
    if (composerMode === "edit" && editingMessage) {
      setText(editingMessage.text);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } else if (composerMode === "compose") {
      setText("");
    }
  }, [composerMode, editingMessage]);

  // Focus input on search mode active
  useEffect(() => {
    if (composerMode === "search" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [composerMode]);

  // Click outside listener for emoji picker
  useEffect(() => {
    function handleClickOutside(event) {
      if (emojiPanelRef.current && !emojiPanelRef.current.contains(event.target)) {
        setEmojiOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleTextChange = (e) => {
    setText(e.target.value);

    // Trigger typing event via socket
    if (socket && activeChatId) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        socket.emit("typing", { chatId: activeChatId });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        socket.emit("stop_typing", { chatId: activeChatId });
      }, 1500);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (composerMode === "search") {
      onCancelMode();
      return;
    }

    const cleanText = text.trim();
    if (!cleanText) return;

    // Reset typing state
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      socket?.emit("stop_typing", { chatId: activeChatId });
    }

    if (composerMode === "edit" && editingMessage) {
      onEditMessage(editingMessage.id, cleanText);
      onCancelMode();
    } else {
      onSendMessage(cleanText);
    }
    setText("");
    setEmojiOpen(false);
  };

  const handleEmojiClick = (emoji) => {
    if (composerMode === "search") return;
    setText((prev) => prev + emoji);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <footer className="composer-container">
      {composerMode !== "compose" && (
        <div className={`composer-mode-banner ${composerMode} pop-up`}>
          <div className="composer-banner-left">
            <span className="composer-mode-label">
              {composerMode === "edit" ? "Editing Message" : "Searching Messages"}
            </span>
            {composerMode === "edit" && editingMessage && (
              <span className="composer-mode-preview">
                : "{editingMessage.text}"
              </span>
            )}
          </div>
          <button
            type="button"
            className="composer-mode-cancel-btn"
            onClick={onCancelMode}
            title="Cancel"
            aria-label="Cancel"
          >
            Cancel
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="composer-form">
        {/* Emoji Button & Picker */}
        <div className="emoji-picker-wrapper" ref={emojiPanelRef}>
          <button
            type="button"
            className={`emoji-btn ${emojiOpen ? "active" : ""}`}
            onClick={() => setEmojiOpen(!emojiOpen)}
            title="Choose an emoji"
            aria-label="Add emoji"
            disabled={composerMode === "search"}
          >
            <SmileIcon size={20} />
          </button>

          {emojiOpen && (
            <div className="emoji-dropdown-panel pop-up">
              <div className="emoji-grid">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="emoji-item-btn"
                    onClick={() => handleEmojiClick(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Message Input Box */}
        <input
          ref={inputRef}
          type="text"
          value={composerMode === "search" ? searchQuery : text}
          onChange={composerMode === "search" ? (e) => onSearchChange(e.target.value) : handleTextChange}
          placeholder={
            composerMode === "search"
              ? "Search messages in this chat..."
              : composerMode === "edit"
              ? "Edit your message..."
              : "Type your message..."
          }
          autoComplete="off"
        />

        {/* Submit Send Button */}
        <button
          type="submit"
          className="send-btn"
          disabled={composerMode !== "search" && !text.trim()}
          title={composerMode === "search" ? "Exit search" : composerMode === "edit" ? "Save edit" : "Send message"}
          aria-label={composerMode === "search" ? "Exit search" : composerMode === "edit" ? "Save edit" : "Send message"}
        >
          <SendIcon size={18} />
        </button>
      </form>
    </footer>
  );
}
