import React from "react";

function initialsFromName(value) {
  const text = String(value || "").trim();
  if (!text) return "?";
  const parts = text.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function avatarColor(value) {
  const text = String(value || "user");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue} 60% 45%)`;
}

export default function Avatar({ label, size = 40, className = "" }) {
  const style = {
    backgroundColor: avatarColor(label),
    width: `${size}px`,
    height: `${size}px`,
    fontSize: `${size * 0.4}px`,
  };

  return (
    <div className={`avatar-badge ${className}`} style={style} aria-label={label}>
      {initialsFromName(label)}
    </div>
  );
}
