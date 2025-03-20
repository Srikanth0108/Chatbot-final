// client/src/components/UI/ProfileModal.jsx
import React, { useState } from "react";
import "./ProfileModal.css";

const ProfileModal = ({
  isOpen,
  onClose,
  currentUser,
  selectedLanguage,
  onLanguageChange,
  onClearChats,
  onLogout,
  isLoading,
  languages,
}) => {
  if (!isOpen) return null;

  // Get first letter of name or email for avatar
  const avatarText = currentUser?.name
    ? currentUser.name.charAt(0).toUpperCase()
    : currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : "U";

  // Get display name
  const displayName = currentUser?.name || currentUser?.email || "User";

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        {/* Profile section */}
        <div className="profile-header">
          <div className="profile-avatar">{avatarText}</div>
          <h2 className="profile-name">{displayName}</h2>
        </div>

        {/* Language section */}
        <div className="profile-section">
          <h3 className="section-title">Language</h3>
          <div className="language-selector">
            <select
              value={selectedLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="language-dropdown"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions section */}
        <div className="profile-actions">
          <button
            className="clear-chats-btn"
            onClick={onClearChats} // Directly calling the function without confirmation
            disabled={isLoading}
          >
            Clear All Chats
          </button>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>

        {/* Close button */}
        <button className="close-modal-btn" onClick={onClose}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ProfileModal;
