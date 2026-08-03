"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, ImagePlus, Settings2, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfileMenu } from "@/components/profile-menu";
import { useAuth } from "@/components/auth-provider";
import { getAppPath, publicBasePath } from "@/lib/supabase/config";
import { avatarConstraints, getProfileName, type ProfileDraft } from "@/lib/supabase/profile";
import type { UserSettings } from "@/lib/supabase/settings";

function formatTimeValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

export default function SettingsPage() {
  const router = useRouter();
  const { status: authStatus, user, settings } = useAuth();

  useEffect(() => {
    if (authStatus === "signed_out") {
      router.replace(getAppPath("/login"));
    }
  }, [authStatus, router]);

  if (authStatus === "loading") {
    return (
      <main className="hu-auth-loading" aria-busy="true">
        <span className="hu-auth-loading-mark" aria-hidden="true" />
        Loading your settings…
      </main>
    );
  }

  if (authStatus !== "signed_in" || !user) {
    return null;
  }

  const profileKey = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  return <SettingsContent key={`${user.id}-${profileKey}-${settings.nightOwlMode}-${settings.dayStartTime}`} />;
}

function SettingsContent() {
  const { user, avatarUrl, settings, updateProfile, updateSettings } = useAuth();
  const [fullName, setFullName] = useState(() => getProfileName(user));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileMessageType, setProfileMessageType] = useState<"error" | "success">("success");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(() => settings);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsMessageType, setSettingsMessageType] = useState<"error" | "success">("success");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  if (!user) {
    return null;
  }

  const profileName = getProfileName(user);
  const imageSource = removeAvatar ? null : avatarUrl;
  const profileInitials = profileName
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
      setProfileMessageType("error");
      setProfileMessage("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > avatarConstraints.maxBytes) {
      setProfileMessageType("error");
      setProfileMessage("Choose an image smaller than 2 MB.");
      return;
    }

    setProfileMessage("");
    setAvatarFile(file);
    setRemoveAvatar(false);
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage("");

    const draft: ProfileDraft = { fullName, avatarFile, removeAvatar };
    const result = await updateProfile(draft);
    setIsSavingProfile(false);

    if (!result.ok) {
      setProfileMessageType("error");
      setProfileMessage(result.message);
      return;
    }

    setAvatarFile(null);
    setRemoveAvatar(false);
    setProfileMessageType("success");
    setProfileMessage("Profile saved.");
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSettings(true);
    setSettingsMessage("");

    const result = await updateSettings(settingsDraft);
    setIsSavingSettings(false);

    if (!result.ok) {
      setSettingsMessageType("error");
      setSettingsMessage(result.message);
      return;
    }

    setSettingsMessageType("success");
    setSettingsMessage("Settings saved.");
  }

  return (
    <main className="hu-shell hu-settings-shell">
      <header className="hu-topbar" aria-label="Global navigation">
        <Link aria-label="Open workspace" className="hu-brand-button" href={getAppPath("/")}>
          <Image
            alt="HeavyUser"
            className="hu-brand-logo"
            height={20}
            priority
            src={`${publicBasePath}/heavyuser-logo.png`}
            width={155}
          />
        </Link>
        <div className="hu-topbar-actions">
          <ProfileMenu workspaceLabel="Settings" />
        </div>
      </header>

      <div className="hu-settings-main">
        <div className="hu-settings-content">
          <Link className="hu-settings-back" href={getAppPath("/")}>
            <ArrowLeft aria-hidden="true" size={14} />
            Back to workspace
          </Link>

          <div className="hu-settings-page-intro">
            <span className="hu-field-label">Workspace settings</span>
            <h1>Settings</h1>
            <p>Keep HeavyUser in step with the way you work.</p>
          </div>

          <section id="account" className="hu-settings-section" aria-labelledby="account-title">
            <div className="hu-settings-section-heading">
              <span className="hu-settings-mark" aria-hidden="true">
                <ImagePlus size={17} />
              </span>
              <div>
                <span className="hu-field-label">Account</span>
                <h2 id="account-title">Your profile</h2>
                <p>Choose the name and portrait HeavyUser uses around your workspace.</p>
              </div>
            </div>

            <form className="hu-settings-form" onSubmit={handleSaveProfile}>
              <div className="hu-profile-editor-avatar">
                <span className="hu-profile-editor-image">
                  {imageSource ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageSource} alt="" />
                  ) : (
                    profileInitials
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
                      <button
                        className="hu-profile-remove-button"
                        type="button"
                        onClick={() => {
                          setAvatarFile(null);
                          setRemoveAvatar(true);
                        }}
                      >
                        <Trash2 aria-hidden="true" size={13} />
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <label className="hu-field" htmlFor="settings-display-name">
                <span className="hu-field-label">Display name</span>
                <input
                  id="settings-display-name"
                  autoComplete="name"
                  className="hu-task-input"
                  maxLength={80}
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </label>

              <label className="hu-field" htmlFor="settings-email">
                <span className="hu-field-label">Email</span>
                <input id="settings-email" className="hu-task-input" disabled value={user.email ?? ""} />
              </label>

              {profileMessage ? (
                <p className={`hu-settings-message is-${profileMessageType}`} role={profileMessageType === "error" ? "alert" : "status"}>
                  {profileMessage}
                </p>
              ) : null}

              <div className="hu-settings-actions">
                <button className="hu-form-button is-primary" disabled={isSavingProfile} type="submit">
                  {isSavingProfile ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          </section>

          <section className="hu-settings-section" aria-labelledby="rhythm-title">
            <div className="hu-settings-section-heading">
              <span className="hu-settings-mark" aria-hidden="true">
                <Settings2 size={17} />
              </span>
              <div>
                <span className="hu-field-label">Daily rhythm</span>
                <h2 id="rhythm-title">Make the day fit</h2>
                <p>Keep the previous day open when your best work happens after midnight.</p>
              </div>
            </div>

            <form className="hu-settings-form" onSubmit={handleSaveSettings}>
              <label className="hu-settings-toggle-row" htmlFor="night-owl-mode">
                <span className="hu-settings-toggle-copy">
                  <strong>Night owl mode</strong>
                  <small>Keep the previous day open past midnight.</small>
                </span>
                <input
                  id="night-owl-mode"
                  aria-describedby="settings-day-start-help"
                  checked={settingsDraft.nightOwlMode}
                  className="hu-settings-switch"
                  type="checkbox"
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      nightOwlMode: event.target.checked,
                    }))
                  }
                />
              </label>

              <label className="hu-settings-time-field" htmlFor="settings-day-start">
                <span className="hu-field-label">New day starts at</span>
                <input
                  id="settings-day-start"
                  aria-describedby="settings-day-start-help"
                  className="hu-edit-input"
                  disabled={!settingsDraft.nightOwlMode}
                  type="time"
                  value={settingsDraft.dayStartTime}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      dayStartTime: event.target.value,
                    }))
                  }
                />
                <small id="settings-day-start-help">
                  {settingsDraft.nightOwlMode
                    ? `Your task day continues until ${formatTimeValue(settingsDraft.dayStartTime)}.`
                    : "Turn on Night owl mode to change this time."}
                </small>
              </label>

              {settingsMessage ? (
                <p className={`hu-settings-message is-${settingsMessageType}`} role={settingsMessageType === "error" ? "alert" : "status"}>
                  {settingsMessage}
                </p>
              ) : null}

              <div className="hu-settings-actions">
                <button className="hu-form-button is-primary" disabled={isSavingSettings} type="submit">
                  {isSavingSettings ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
