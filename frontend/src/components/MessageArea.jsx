import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "./Avatar";
import { DoneAllIcon, TrashIcon } from "./Icons";

const EditIcon = ({ size = 15, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const GlobeIcon = ({ size = 15, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const timeFormatter = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hour12: false });

function formatDateDivider(dateIsoString) {
  try {
    const date = new Date(dateIsoString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = today - msgDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) {
      return new Intl.DateTimeFormat([], { weekday: "long" }).format(date);
    }
    return new Intl.DateTimeFormat([], { year: "numeric", month: "long", day: "numeric" }).format(date);
  } catch (err) {
    return "";
  }
}

function splitTokens(tokens, regex, matchCreator) {
  const result = [];
  tokens.forEach((token) => {
    if (token.type !== "text") {
      result.push(token);
      return;
    }
    let lastIndex = 0;
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(token.text)) !== null) {
      const preText = token.text.substring(lastIndex, match.index);
      if (preText) result.push({ type: "text", text: preText });
      result.push(matchCreator(match));
      lastIndex = regex.lastIndex;
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
    const postText = token.text.substring(lastIndex);
    if (postText) result.push({ type: "text", text: postText });
  });
  return result;
}

function parseFormattedText(text, searchQuery = "") {
  if (!text) return "";

  // 1. Separate URLs first to make sure they aren't parsed by other markdown tags
  let tokens = [];
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  let lastIndex = 0;
  let match;
  urlRegex.lastIndex = 0;

  while ((match = urlRegex.exec(text)) !== null) {
    const preText = text.substring(lastIndex, match.index);
    if (preText) tokens.push({ type: "text", text: preText });
    tokens.push({ type: "url", text: match[1] });
    lastIndex = urlRegex.lastIndex;
  }
  const postText = text.substring(lastIndex);
  if (postText) tokens.push({ type: "text", text: postText });

  if (tokens.length === 0) {
    tokens = [{ type: "text", text }];
  }

  // 2. Parse inline code block: `code`
  tokens = splitTokens(tokens, /`([^`]+)`/g, (m) => ({ type: "code", text: m[1] }));

  // 3. Parse bold: *bold*
  tokens = splitTokens(tokens, /\*([^*]+)\*/g, (m) => ({ type: "bold", text: m[1] }));

  // 4. Parse italic: _italic_
  tokens = splitTokens(tokens, /_([^_]+)_/g, (m) => ({ type: "italic", text: m[1] }));

  // 5. Parse search query highlights (only inside text/bold/italic tokens, not code/url)
  if (searchQuery && searchQuery.trim()) {
    const escapedSearch = searchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const searchRegex = new RegExp(`(${escapedSearch})`, "gi");

    const highlightedTokens = [];
    tokens.forEach((token) => {
      if (token.type === "code" || token.type === "url") {
        highlightedTokens.push(token);
        return;
      }

      let innerLastIndex = 0;
      let innerMatch;
      searchRegex.lastIndex = 0;

      while ((innerMatch = searchRegex.exec(token.text)) !== null) {
        const preText = token.text.substring(innerLastIndex, innerMatch.index);
        if (preText) highlightedTokens.push({ type: token.type, text: preText });
        highlightedTokens.push({ type: "highlight", text: innerMatch[1], parentType: token.type });
        innerLastIndex = searchRegex.lastIndex;
        if (innerMatch.index === searchRegex.lastIndex) searchRegex.lastIndex++;
      }
      const innerPostText = token.text.substring(innerLastIndex);
      if (innerPostText) highlightedTokens.push({ type: token.type, text: innerPostText });
    });
    tokens = highlightedTokens;
  }

  // Render tokens to React elements
  return tokens.map((token, index) => {
    const key = `token-${index}`;
    
    // Helper to wrap the text in appropriate tag based on type
    const wrap = (val, type) => {
      switch (type) {
        case "bold":
          return <strong key={key}>{val}</strong>;
        case "italic":
          return <em key={key}>{val}</em>;
        case "code":
          return <code key={key} className="inline-code">{val}</code>;
        case "url":
          return (
            <a key={key} href={val} target="_blank" rel="noopener noreferrer" className="message-link">
              {val}
            </a>
          );
        default:
          return val;
      }
    };

    if (token.type === "highlight") {
      return (
        <mark key={key} className="msg-highlight">
          {wrap(token.text, token.parentType)}
        </mark>
      );
    }

    return wrap(token.text, token.type);
  });
}

function groupMessagesByDate(messagesList) {
  const groups = {};
  messagesList.forEach((msg) => {
    if (!msg.createdAt) return;
    const date = new Date(msg.createdAt);
    const dateKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(msg);
  });
  return Object.entries(groups).sort((a, b) => new Date(a[0]) - new Date(b[0]));
}

export default function MessageArea({
  messages,
  selfPhone,
  searchQuery,
  onStartEdit,
  onDeleteMessage
}) {
  const scrollRef = useRef(null);
  const menuRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, message }

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Context menu handlers
  const handleContextMenu = (e, msg) => {
    if (msg.senderPhone !== selfPhone) return;
    if (msg.isDeletedForEveryone) return;
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 180;
    const menuHeight = 140;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let x = e.clientX;
    let y = e.clientY;

    // Adjust left if overflowing right edge
    if (x + menuWidth > windowWidth - 16) {
      x = windowWidth - menuWidth - 16;
    }
    if (x < 16) {
      x = 16;
    }

    // Adjust top if overflowing bottom edge
    if (y + menuHeight > windowHeight - 16) {
      y = windowHeight - menuHeight - 16;
    }
    if (y < 16) {
      y = 16;
    }

    setContextMenu({ x, y, message: msg });
  };

  const handleActionClick = (e, msg) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();

    const menuWidth = 180;
    const menuHeight = 140;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let x = rect.left;
    let y = rect.bottom + 6;

    // Adjust left if overflowing right edge
    if (x + menuWidth > windowWidth - 16) {
      x = windowWidth - menuWidth - 16;
    }
    if (x < 16) {
      x = 16;
    }

    // Adjust top if overflowing bottom edge
    if (y + menuHeight > windowHeight - 16) {
      y = windowHeight - menuHeight - 16;
    }
    if (y < 16) {
      y = 16;
    }

    setContextMenu({ x, y, message: msg });
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    const handleGlobalClick = (event) => {
      if (event.button === 2) return; // Ignore right click so it doesn't immediately close
      if (menuRef.current && menuRef.current.contains(event.target)) {
        return; // Clicked inside the menu, let the buttons handle it
      }
      closeContextMenu();
    };
    window.addEventListener("mousedown", handleGlobalClick);
    return () => window.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  const groupedMessages = groupMessagesByDate(messages);

  return (
    <section className="messages-area" ref={scrollRef}>
      {groupedMessages.length === 0 ? (
        <div className="messages-empty-state">
          <p>{searchQuery ? "No messages match your search query." : "No messages here. Say hello!"}</p>
        </div>
      ) : (
        groupedMessages.map(([dateIso, msgs]) => (
          <div key={dateIso} className="message-date-group">
            <div className="message-date-divider" role="separator">
              <span>{formatDateDivider(dateIso)}</span>
            </div>
            
            {msgs.map((msg) => {
              const isSelf = msg.senderPhone === selfPhone;
              const formattedTime = timeFormatter.format(new Date(msg.createdAt));
              const senderDisplayName = isSelf ? "You" : msg.senderName || msg.senderPhone;

              return (
                <article
                  key={msg.id}
                  className={`message-bubble-row ${isSelf ? "self-row" : "other-row"}`}
                >
                  {!isSelf && (
                    <Avatar
                      label={msg.senderName || msg.senderPhone}
                      size={32}
                      className="message-bubble-avatar"
                    />
                  )}
                  
                  <div
                    className={`message-bubble ${isSelf ? "self" : "other"}`}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                  >
                    {isSelf && !msg.isDeletedForEveryone && (
                      <button
                        type="button"
                        className="message-action-btn"
                        title="Options"
                        onClick={(e) => handleActionClick(e, msg)}
                      >
                        ⋮
                      </button>
                    )}
                    {!isSelf && (
                      <span className="message-sender-name">{senderDisplayName}</span>
                    )}
                    <p className={`message-text ${msg.isDeletedForEveryone ? "deleted-text" : ""}`}>
                      {msg.isDeletedForEveryone ? "This message deleted" : parseFormattedText(msg.text, searchQuery)}
                    </p>
                    <div className="message-meta">
                      {msg.isEdited && !msg.isDeletedForEveryone && (
                        <span className="message-edited-label">Edited</span>
                      )}
                      <time className="message-time">{formattedTime}</time>
                      {isSelf && (
                        <span className="message-status-icon" title="Sent">
                          <DoneAllIcon size={14} className="icon-checks-active" />
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))
      )}
      
      {contextMenu && createPortal(
        <div
          ref={menuRef}
          className="custom-context-menu pop-up"
          style={{
            top: contextMenu.y,
            left: contextMenu.x
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              onStartEdit(contextMenu.message);
              closeContextMenu();
            }}
          >
            <EditIcon size={14} className="menu-item-icon" />
            <span>Edit Message</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              onDeleteMessage(contextMenu.message.id, "me");
              closeContextMenu();
            }}
          >
            <TrashIcon size={14} className="menu-item-icon" />
            <span>Delete for Me</span>
          </button>
          <button
            type="button"
            className="context-menu-item context-menu-item-danger"
            onClick={() => {
              onDeleteMessage(contextMenu.message.id, "everyone");
              closeContextMenu();
            }}
          >
            <GlobeIcon size={14} className="menu-item-icon" />
            <span>Delete for Everyone</span>
          </button>
        </div>,
        document.body
      )}
    </section>
  );
}
