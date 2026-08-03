"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getProfileName, getPublicUserId } from "@/lib/supabase/profile";
import { getAppPath } from "@/lib/supabase/config";

export function ProfileMenu({ onSignedOut }: { onSignedOut?: () => void }) {
  const router = useRouter();
  const { user, avatarUrl, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isUserIdCopied, setIsUserIdCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
  }, []);

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

  async function handleCopyUserId() {
    setMessage("");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicUserId);
      } else {
        const fallbackInput = document.createElement("textarea");
        fallbackInput.value = publicUserId;
        fallbackInput.setAttribute("readonly", "true");
        fallbackInput.style.position = "fixed";
        fallbackInput.style.opacity = "0";
        document.body.appendChild(fallbackInput);
        fallbackInput.select();
        const copied = document.execCommand("copy");
        fallbackInput.remove();
        if (!copied) {
          throw new Error("Copy command failed.");
        }
      }

      setIsUserIdCopied(true);
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setIsUserIdCopied(false);
        copyResetTimerRef.current = null;
      }, 1600);
    } catch {
      setMessage("Could not copy the user ID.");
    }
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
              <div className="hu-popover-profile-id-row">
                <small className="hu-popover-profile-id">User ID {publicUserId}</small>
                <button
                  aria-label={isUserIdCopied ? "User ID copied" : "Copy user ID"}
                  className={`hu-profile-copy-button ${isUserIdCopied ? "is-copied" : ""}`}
                  title={isUserIdCopied ? "Copied" : "Copy user ID"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleCopyUserId();
                  }}
                >
                  {isUserIdCopied ? <Check aria-hidden="true" size={11} /> : <Copy aria-hidden="true" size={11} />}
                </button>
              </div>
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
