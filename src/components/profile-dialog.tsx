"use client";

import { ChangeEvent, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { avatarConstraints, type ProfileDraft } from "@/lib/supabase/profile";
import { useAuth } from "@/components/auth-provider";

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, avatarUrl, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(() => typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!open || !user) {
    return null;
  }

  const profileName = fullName.trim() || user.email?.split("@")[0] || "HeavyUser";
  const imageSource = removeAvatar ? null : avatarUrl;
  const initials = profileName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (!avatarConstraints.acceptedTypes.includes(file.type as (typeof avatarConstraints.acceptedTypes)[number])) {
      setMessage("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > avatarConstraints.maxBytes) {
      setMessage("Choose an image smaller than 2 MB.");
      return;
    }

    setMessage("");
    setAvatarFile(file);
    setRemoveAvatar(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    const draft: ProfileDraft = { fullName, avatarFile, removeAvatar };
    const result = await updateProfile(draft);
    setIsSaving(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    onClose();
  }

  return (
    <div
      className="hu-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <form
        aria-labelledby="profile-title"
        className="hu-settings-dialog hu-profile-dialog"
        role="dialog"
        aria-modal="true"
        onSubmit={handleSubmit}
      >
        <button aria-label="Close profile" className="hu-task-dialog-close hu-icon-button" type="button" onClick={onClose}>
          <X aria-hidden="true" />
        </button>

        <div className="hu-settings-dialog-body">
          <div className="hu-settings-intro">
            <span className="hu-settings-mark" aria-hidden="true">
              <ImagePlus size={17} />
            </span>
            <div>
              <span className="hu-field-label">Account</span>
              <h2 id="profile-title">Your profile</h2>
              <p>Keep the name and portrait HeavyUser uses around your workspace.</p>
            </div>
          </div>

          <div className="hu-profile-editor-avatar">
            <span className="hu-profile-editor-image">
              {imageSource ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageSource} alt="" />
              ) : (
                initials
              )}
            </span>
            <div className="hu-profile-editor-avatar-copy">
              <strong>Profile portrait</strong>
              <span>{avatarFile ? `${avatarFile.name} selected` : "JPG, PNG, or WebP · up to 2 MB"}</span>
              <div className="hu-profile-editor-avatar-actions">
                <label className="hu-profile-file-button">
                  <ImagePlus aria-hidden="true" size={13} />
                  Choose image
                  <input accept={avatarConstraints.acceptedTypes.join(",")} type="file" onChange={handleAvatarChange} />
                </label>
                {(avatarUrl || avatarFile) && !removeAvatar ? (
                  <button className="hu-profile-remove-button" type="button" onClick={() => { setAvatarFile(null); setRemoveAvatar(true); }}>
                    <Trash2 aria-hidden="true" size={13} />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <label className="hu-field">
            <span className="hu-field-label">Display name</span>
            <input autoComplete="name" className="hu-task-input" maxLength={80} required value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>

          <label className="hu-field">
            <span className="hu-field-label">Email</span>
            <input className="hu-task-input" disabled value={user.email ?? ""} />
          </label>

          {message ? <p className="hu-profile-form-message" role="alert">{message}</p> : null}
        </div>

        <div className="hu-task-dialog-actions">
          <button className="hu-form-button" type="button" disabled={isSaving} onClick={onClose}>Cancel</button>
          <button className="hu-form-button is-primary" disabled={isSaving} type="submit">{isSaving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}
