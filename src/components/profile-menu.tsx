"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getProfileName, getPublicUserId } from "@/lib/supabase/profile";
import { getAppPath } from "@/lib/supabase/config";

export function ProfileMenu({ onSignedOut }: { onSignedOut?: () => void }) {
  const router = useRouter();
  const { user, avatarUrl, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!user) {
    return null;
  }

  const profileName = getProfileName(user);
  const publicUserId = getPublicUserId(user);
  const profileInitials = profileName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    setMessage("");
    const result = await signOut();
    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    onSignedOut?.();
    router.replace(getAppPath("/login"));
  }

  function openSettings() {
    setIsOpen(false);
    router.push(getAppPath("/settings"));
  }

  return (
    <div ref={menuRef} className="hu-popover-anchor">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="hu-profile-button"
        type="button"
        title={`${profileName} · ${publicUserId}`}
        onClick={() => {
          setIsOpen((current) => !current);
          setMessage("");
        }}
      >
        <span className="hu-avatar">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" />
          ) : (
            <span aria-hidden="true">{profileInitials}</span>
          )}
        </span>
        <span className="hu-profile-copy">
          <span className="hu-profile-name">{profileName}</span>
          <span className="hu-profile-workspace">
            <span className="hu-profile-user-id">{publicUserId}</span>
          </span>
        </span>
        <ChevronDown aria-hidden="true" size={14} />
      </button>
      {isOpen ? (
        <div className="hu-popover hu-profile-popover" role="menu" aria-label="Profile menu">
          <div className="hu-popover-profile" role="presentation">
            <span className="hu-profile-portrait">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" />
              ) : (
                <span aria-hidden="true">{profileInitials}</span>
              )}
            </span>
            <div className="hu-popover-profile-copy">
              <strong>{profileName}</strong>
              <span>{user.email ?? profileName}</span>
              <small className="hu-popover-profile-id">User ID {publicUserId}</small>
            </div>
          </div>
          <div className="hu-popover-divider" role="presentation" />
          <button className="hu-menu-item" role="menuitem" type="button" onClick={() => openSettings()}>
            <Settings2 aria-hidden="true" size={14} />
            <span>Settings</span>
          </button>
          <div className="hu-popover-divider" role="presentation" />
          <button className="hu-auth-action" type="button" onClick={() => void handleSignOut()}>
            Sign out
          </button>
          {message ? <span className="hu-auth-message" role="alert">{message}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
