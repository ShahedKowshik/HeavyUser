"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, ChevronRight, ImagePlus, MoonStar, Settings2, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfileMenu } from "@/components/profile-menu";
import { useAuth } from "@/components/auth-provider";
import { getAppPath, publicBasePath } from "@/lib/supabase/config";
import { avatarConstraints, getProfileName, type ProfileDraft } from "@/lib/supabase/profile";
import type { UserSettings } from "@/lib/supabase/settings";
import { DEFAULT_SCHEDULER_PREFERENCES, type SchedulerPreferences, type WorkWindow } from "@/lib/scheduler/types";
import { hasWorkingWindow, normalizeSchedulerPreferences } from "@/lib/scheduler/preferences";
import { SpacesSettings } from "@/components/spaces-settings";

const schedulerWeekdays = [
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
  { key: "0", label: "Sunday" },
] as const;

const settingsNavigation = [
  { href: "#account", label: "Profile", detail: "Name and avatar", icon: UserRound },
  { href: "#rhythm", label: "Daily rhythm", detail: "When your day starts", icon: MoonStar },
  { href: "#scheduling", label: "Task scheduling", detail: "Where work can fit", icon: CalendarClock },
  { href: "#spaces", label: "Spaces", detail: "Calendars and labels", icon: Settings2 },
] as const;

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
  const [schedulerDraft, setSchedulerDraft] = useState<SchedulerPreferences>({ ...DEFAULT_SCHEDULER_PREFERENCES });
  const [isLoadingScheduler, setIsLoadingScheduler] = useState(true);
  const [isSavingScheduler, setIsSavingScheduler] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState("");
  const [schedulerMessageType, setSchedulerMessageType] = useState<"error" | "success">("success");

  useEffect(() => {
    let cancelled = false;
    void fetch(getAppPath("/api/scheduler/settings"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Scheduling settings could not be loaded.");
        }
        const body = (await response.json()) as { settings?: unknown };
        if (!cancelled) {
          setSchedulerDraft(normalizeSchedulerPreferences(body.settings, Intl.DateTimeFormat().resolvedOptions().timeZone));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSchedulerMessageType("error");
          setSchedulerMessage(error instanceof Error ? error.message : "Scheduling settings could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingScheduler(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function handleSaveScheduler(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingScheduler(true);
    setSchedulerMessage("");
    if (schedulerDraft.defaultMinBlockMinutes > schedulerDraft.defaultMaxBlockMinutes) {
      setSchedulerMessageType("error");
      setSchedulerMessage("The minimum block must be shorter than the maximum block.");
      setIsSavingScheduler(false);
      return;
    }
    if (!hasWorkingWindow(schedulerDraft)) {
      setSchedulerMessageType("error");
      setSchedulerMessage("Add at least one working window so HeavyUser knows when to place task time.");
      setIsSavingScheduler(false);
      return;
    }

    try {
      const response = await fetch(getAppPath("/api/scheduler/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedulerDraft),
      });
      const body = (await response.json().catch(() => null)) as { settings?: unknown; error?: string; schedulerError?: string | null } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Scheduling settings could not be saved.");
      }
      setSchedulerDraft(normalizeSchedulerPreferences(body?.settings, schedulerDraft.timezone));
      if (body?.schedulerError) {
        setSchedulerMessageType("error");
        setSchedulerMessage(`Saved, but scheduling needs attention: ${body.schedulerError}`);
      } else {
        setSchedulerMessageType("success");
        setSchedulerMessage("Saved. Eligible tasks were rescheduled.");
      }
    } catch (error) {
      setSchedulerMessageType("error");
      setSchedulerMessage(error instanceof Error ? error.message : "Scheduling settings could not be saved.");
    } finally {
      setIsSavingScheduler(false);
    }
  }

  function updateSchedulerWindows(day: string, windows: ReadonlyArray<WorkWindow>) {
    setSchedulerDraft((current) => ({
      ...current,
      workWindows: {
        ...current.workWindows,
        [day]: [
          ...(current.workWindows[day] ?? []).filter((window) => window.allDay),
          ...windows,
        ],
      },
    }));
  }

  function toggleSchedulerAllDay(day: string, enabled: boolean) {
    setSchedulerDraft((current) => {
      const windows = current.workWindows[day] ?? [];
      const manualWindows = windows.filter((window) => !window.allDay);
      return {
        ...current,
        workWindows: {
          ...current.workWindows,
          [day]: enabled
            ? [{ start: "00:00", end: "23:59", allDay: true }, ...manualWindows]
            : manualWindows,
        },
      };
    });
  }

  function updateSchedulerWindow(day: string, index: number, key: keyof WorkWindow, value: string) {
    const windows = (schedulerDraft.workWindows[day] ?? []).filter((window) => !window.allDay);
    const current = windows[index] ?? { start: "09:00", end: "17:00" };
    windows[index] = { ...current, [key]: value };
    updateSchedulerWindows(day, windows);
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
          <ProfileMenu />
        </div>
      </header>

      <div className="hu-settings-main">
        <div className="hu-settings-content">
          <Link className="hu-settings-back" href={getAppPath("/")}>
            <ArrowLeft aria-hidden="true" size={14} />
            Back to workspace
          </Link>

          <div className="hu-settings-hero">
            <div className="hu-settings-page-intro">
              <span className="hu-field-label">Workspace control center</span>
              <h1>Settings</h1>
              <p>Set up the way HeavyUser sees your day, then get back to the work.</p>
            </div>
            <div className="hu-settings-summary" aria-label="Current setup">
              <div className="hu-settings-summary-item">
                <span className="hu-settings-summary-label">Profile</span>
                <strong>{profileName}</strong>
                <small>{user.email ?? "Account email"}</small>
              </div>
              <div className="hu-settings-summary-item">
                <span className="hu-settings-summary-label">Task day</span>
                <strong>{settingsDraft.nightOwlMode ? formatTimeValue(settingsDraft.dayStartTime) : "12:00 AM"}</strong>
                <small>{settingsDraft.nightOwlMode ? "Night Owl mode" : "Calendar day"}</small>
              </div>
              <div className="hu-settings-summary-item">
                <span className="hu-settings-summary-label">Task planning</span>
                <strong>{isLoadingScheduler ? "Checking…" : "Automatic"}</strong>
                <small>For eligible tasks</small>
              </div>
            </div>
          </div>

          <div className="hu-settings-layout">
            <aside className="hu-settings-sidebar" aria-label="Settings sections">
              <div className="hu-settings-sidebar-heading">
                <span className="hu-settings-sidebar-kicker">Settings</span>
                <strong>Shape your workday</strong>
              </div>
              <nav className="hu-settings-nav" aria-label="Settings sections">
                {settingsNavigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a className="hu-settings-nav-link" href={item.href} key={item.href}>
                      <Icon aria-hidden="true" size={15} />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <ChevronRight aria-hidden="true" size={14} />
                    </a>
                  );
                })}
              </nav>
              <p className="hu-settings-sidebar-note">
                <SlidersHorizontal aria-hidden="true" size={13} />
                Changes save to your account.
              </p>
            </aside>

            <div className="hu-settings-section-stack">

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

            <form className="hu-settings-form hu-profile-settings-form" onSubmit={handleSaveProfile}>
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

          <section id="rhythm" className="hu-settings-section" aria-labelledby="rhythm-title">
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

            <form className="hu-settings-form hu-rhythm-settings-form" onSubmit={handleSaveSettings}>
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

          <section id="scheduling" className="hu-settings-section" aria-labelledby="scheduling-title">
            <div className="hu-settings-section-heading">
              <span className="hu-settings-mark" aria-hidden="true">
                <CalendarClock size={17} />
              </span>
              <div>
                <span className="hu-field-label">Task calendar</span>
                <h2 id="scheduling-title">Protect time for your tasks</h2>
                <p>HeavyUser will place task work around your Google Calendar and repair flexible blocks when plans change.</p>
              </div>
            </div>

            {isLoadingScheduler ? <p className="hu-settings-message">Loading scheduling settings…</p> : (
              <form className="hu-settings-form hu-scheduler-settings-form" onSubmit={handleSaveScheduler}>
                <p className="hu-settings-inline-note">Automatic scheduling is always on for eligible tasks. These settings control where HeavyUser can place the time.</p>

                <div className="hu-scheduler-settings-grid">
                  <label className="hu-field">
                    <span className="hu-field-label">Timezone</span>
                    <input
                      aria-label="Scheduling timezone"
                      className="hu-edit-input"
                      placeholder="Asia/Dhaka"
                      value={schedulerDraft.timezone}
                      onChange={(event) => setSchedulerDraft((current) => ({ ...current, timezone: event.target.value }))}
                    />
                  </label>
                  <label className="hu-field">
                    <span className="hu-field-label">Default minimum block</span>
                    <span className="hu-duration-input-wrap">
                      <input
                        aria-label="Default minimum block in minutes"
                        className="hu-edit-input hu-duration-input"
                        min="5"
                        step="5"
                        type="number"
                        value={schedulerDraft.defaultMinBlockMinutes}
                        onChange={(event) => setSchedulerDraft((current) => ({ ...current, defaultMinBlockMinutes: Number(event.target.value) || 5 }))}
                      />
                      <span aria-hidden="true">min</span>
                    </span>
                  </label>
                  <label className="hu-field">
                    <span className="hu-field-label">Default maximum block</span>
                    <span className="hu-duration-input-wrap">
                      <input
                        aria-label="Default maximum block in minutes"
                        className="hu-edit-input hu-duration-input"
                        min="5"
                        step="5"
                        type="number"
                        value={schedulerDraft.defaultMaxBlockMinutes}
                        onChange={(event) => setSchedulerDraft((current) => ({ ...current, defaultMaxBlockMinutes: Number(event.target.value) || 5 }))}
                      />
                      <span aria-hidden="true">min</span>
                    </span>
                  </label>
                  <label className="hu-field">
                    <span className="hu-field-label">Default visibility</span>
                    <select
                      className="hu-edit-input"
                      value={schedulerDraft.defaultCalendarVisibility}
                      onChange={(event) => setSchedulerDraft((current) => ({ ...current, defaultCalendarVisibility: event.target.value as SchedulerPreferences["defaultCalendarVisibility"] }))}
                    >
                      <option value="default">Google Calendar default</option>
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                  <label className="hu-field">
                    <span className="hu-field-label">Default availability</span>
                    <select
                      className="hu-edit-input"
                      value={schedulerDraft.defaultCalendarTransparency}
                      onChange={(event) => setSchedulerDraft((current) => ({ ...current, defaultCalendarTransparency: event.target.value as SchedulerPreferences["defaultCalendarTransparency"] }))}
                    >
                      <option value="default">Google Calendar default</option>
                      <option value="opaque">Busy</option>
                      <option value="transparent">Free</option>
                    </select>
                  </label>
                </div>

                <div className="hu-work-window-list">
                  <div className="hu-work-window-heading">
                    <span className="hu-field-label">Working hours</span>
                    <small>All day follows Night Owl. Add another window for breaks.</small>
                  </div>
                  {schedulerWeekdays.map((day) => {
                    const windows = schedulerDraft.workWindows[day.key] ?? [];
                    const allDay = windows.some((window) => window.allDay);
                    const manualWindows = windows.filter((window) => !window.allDay);
                    return (
                      <div className="hu-work-window-row" key={day.key}>
                        <div className="hu-work-window-day">
                          <strong>{day.label}</strong>
                          <label className="hu-work-window-all-day">
                            <input
                              aria-label={`${day.label} all day`}
                              checked={allDay}
                              type="checkbox"
                              onChange={(event) => toggleSchedulerAllDay(day.key, event.target.checked)}
                            />
                            <span>All day</span>
                          </label>
                        </div>
                        <div className="hu-work-window-fields">
                          {allDay ? (
                            <span className="hu-work-window-full-day">
                              {schedulerDraft.nightOwlMode
                                ? `Whole logical day · starts ${formatTimeValue(schedulerDraft.dayStartTime)}`
                                : "Whole calendar day"}
                            </span>
                          ) : manualWindows.length === 0 ? <span className="hu-work-window-off">Off</span> : manualWindows.map((window, index) => (
                            <span className="hu-work-window" key={`${day.key}-${index}`}>
                              <input aria-label={`${day.label} window ${index + 1} start`} className="hu-edit-input" type="time" value={window.start} onChange={(event) => updateSchedulerWindow(day.key, index, "start", event.target.value)} />
                              <span aria-hidden="true">to</span>
                              <input aria-label={`${day.label} window ${index + 1} end`} className="hu-edit-input" type="time" value={window.end} onChange={(event) => updateSchedulerWindow(day.key, index, "end", event.target.value)} />
                              <button className="hu-work-window-remove" type="button" onClick={() => updateSchedulerWindows(day.key, manualWindows.filter((_, windowIndex) => windowIndex !== index))}>Remove</button>
                            </span>
                          ))}
                          {!allDay && manualWindows.length < 4 ? (
                            <button className="hu-work-window-add" type="button" onClick={() => updateSchedulerWindows(day.key, [...manualWindows, { start: "13:00", end: "14:00" }])}>+ Add window</button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {schedulerMessage ? <p className={`hu-settings-message is-${schedulerMessageType}`} role={schedulerMessageType === "error" ? "alert" : "status"}>{schedulerMessage}</p> : null}
                <div className="hu-settings-actions">
                  <button className="hu-form-button is-primary" disabled={isSavingScheduler} type="submit">{isSavingScheduler ? "Saving…" : "Save scheduling"}</button>
                </div>
              </form>
            )}
          </section>

          <div id="spaces" className="hu-settings-anchor">
            <SpacesSettings />
          </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
