"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays, Check, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { getAppPath } from "@/lib/supabase/config";

type CalendarConnection = {
  status: string;
  accountEmail: string | null;
  calendarId: string | null;
  calendarName: string | null;
  timeZone: string | null;
  lastError: string | null;
  updatedAt: string;
};

type CalendarOption = {
  id: string;
  name: string;
  description: string | null;
  timeZone: string | null;
  primary: boolean;
  backgroundColor: string | null;
};

type LiveEvent = {
  id: string;
  providerEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  startDate: string | null;
  endDate: string | null;
  allDay: boolean;
  hasAttendees: boolean;
  etag: string | null;
  htmlLink: string | null;
  timeZone: string | null;
  recurringEventId: string | null;
};

type EventDraft = {
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
};

type GoogleCalendarPanelProps = {
  date: string;
  timelineStart: number;
  timelineHours: number;
};

function formatDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function getDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function getEventRange(event: LiveEvent, date: string, timeZone: string) {
  if (!event.start || !event.end || event.allDay) {
    return null;
  }

  const start = getDateParts(new Date(event.start), timeZone);
  const end = getDateParts(new Date(event.end), timeZone);
  if (start.date > date || end.date < date) {
    return null;
  }

  return {
    start: start.date < date ? 0 : start.minutes,
    end: end.date > date ? 24 * 60 : Math.max(end.minutes, start.minutes + 15),
  };
}

function formatEventTime(event: LiveEvent, timeZone: string) {
  if (event.allDay || !event.start || !event.end) {
    return "All day";
  }

  const formatter = new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(event.start))} – ${formatter.format(new Date(event.end))}`;
}

function toDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string) {
  return new Date(value).toISOString();
}

function defaultDraft(date: string): EventDraft {
  return { title: "", description: "", location: "", start: `${date}T10:00`, end: `${date}T10:30` };
}

export function GoogleCalendarPanel({
  date,
  timelineStart,
  timelineHours,
}: GoogleCalendarPanelProps) {
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [events, setEvents] = useState<ReadonlyArray<LiveEvent>>([]);
  const [calendarOptions, setCalendarOptions] = useState<ReadonlyArray<CalendarOption>>([]);
  const [isCalendarPickerOpen, setIsCalendarPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [editingEvent, setEditingEvent] = useState<LiveEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(defaultDraft(date));
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const timeZone = connection?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentTime = getDateParts(new Date(), timeZone).minutes / 60;
  const currentTimeLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  const timeLabels = Array.from({ length: timelineHours + 1 }, (_, index) => {
    const hour = timelineStart + index;
    const displayHour = hour % 12 || 12;
    return `${String(displayHour).padStart(2, "0")}:00 ${hour >= 12 ? "PM" : "AM"}`;
  });

  const visibleLiveEvents = useMemo(() => {
    return events.filter((event) => {
      if (event.allDay) {
        return Boolean(event.startDate && event.endDate && event.startDate <= date && event.endDate > date);
      }
      return Boolean(getEventRange(event, date, timeZone));
    });
  }, [date, events, timeZone]);

  async function loadCalendars() {
    setError("");
    const response = await fetch(getAppPath("/api/google/calendar/calendars"), { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { calendars?: CalendarOption[]; error?: string } | null;
    if (!response.ok) {
      throw new Error(body?.error ?? "Google calendars could not be loaded.");
    }
    setCalendarOptions(body?.calendars ?? []);
    setIsCalendarPickerOpen(true);
  }

  async function loadConnectionAndEvents(showSpinner = true) {
    if (showSpinner) {
      setIsLoading(true);
    }
    setError("");
    try {
      const connectionResponse = await fetch(getAppPath("/api/google/calendar/connection"), { cache: "no-store" });
      const connectionBody = (await connectionResponse.json().catch(() => null)) as { connection?: CalendarConnection | null; error?: string } | null;
      if (!connectionResponse.ok) {
        throw new Error(connectionBody?.error ?? "Calendar connection could not be checked.");
      }

      const nextConnection = connectionBody?.connection ?? null;
      setConnection(nextConnection);
      if (!nextConnection?.calendarId) {
        setEvents([]);
        if (nextConnection?.status === "awaiting_calendar") {
          await loadCalendars();
        }
        return;
      }

      const eventsResponse = await fetch(getAppPath("/api/google/calendar/events"), { cache: "no-store" });
      const eventsBody = (await eventsResponse.json().catch(() => null)) as { events?: LiveEvent[]; connection?: CalendarConnection; error?: string } | null;
      if (!eventsResponse.ok) {
        throw new Error(eventsBody?.error ?? "Calendar events could not be loaded.");
      }
      setConnection(eventsBody?.connection ?? nextConnection);
      setEvents(eventsBody?.events ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Calendar could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    // The async loader owns its state transitions after the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConnectionAndEvents();
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("google_calendar") === "select") {
      void loadCalendars().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Calendars could not be loaded."));
      window.history.replaceState({}, "", window.location.pathname);
    }
    // The loader intentionally runs once when the planner mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginCreate() {
    setError("");
    setIsCreating(true);
    setEditingEvent(null);
    setDraft(defaultDraft(date));
  }

  function beginEdit(event: LiveEvent) {
    setError("");
    setIsCreating(false);
    setEditingEvent(event);
    setDraft({
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      start: toDateTimeInput(event.start),
      end: toDateTimeInput(event.end),
    });
  }

  async function chooseCalendar(calendarId: string) {
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(getAppPath("/api/google/calendar/select"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "That calendar could not be selected.");
      }
      setIsCalendarPickerOpen(false);
      await loadConnectionAndEvents(false);
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "That calendar could not be selected.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.start || !draft.end) {
      setError("Enter a title, start time, and end time.");
      return;
    }
    if (new Date(draft.end).getTime() <= new Date(draft.start).getTime()) {
      setError("The end time must be after the start time.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(getAppPath("/api/google/calendar/events"), {
        method: isCreating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCreating ? {
          title: draft.title,
          description: draft.description,
          location: draft.location,
          start: fromDateTimeInput(draft.start),
          end: fromDateTimeInput(draft.end),
        } : {
          eventKey: editingEvent?.id,
          etag: editingEvent?.etag,
          title: draft.title,
          description: draft.description,
          location: draft.location,
          start: fromDateTimeInput(draft.start),
          end: fromDateTimeInput(draft.end),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The event could not be saved.");
      }
      setEditingEvent(null);
      setIsCreating(false);
      await loadConnectionAndEvents(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The event could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingEvent || !window.confirm(`Delete “${editingEvent.title}” from Google Calendar?`)) {
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`${getAppPath("/api/google/calendar/events")}?eventKey=${encodeURIComponent(editingEvent.id)}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The event could not be deleted.");
      }
      setEditingEvent(null);
      await loadConnectionAndEvents(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The event could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  }

  async function refresh() {
    setIsRefreshing(true);
    await loadConnectionAndEvents(false);
  }

  const isConnected = Boolean(connection?.calendarId);
  const allDayEvents = visibleLiveEvents.filter((event) => event.allDay);
  const timedEvents = visibleLiveEvents.filter((event) => !event.allDay);

  return (
    <section className="hu-region hu-calendar-region" aria-label="Planner">
      <div className="hu-calendar-toolbar">
        <div>
          <span className="hu-calendar-kicker">Planner</span>
          <strong>{formatDateLabel(date)}</strong>
        </div>
        <div className="hu-calendar-actions">
          {isConnected ? (
            <>
              <span className="hu-calendar-connection" title={connection?.accountEmail ?? "Google Calendar connected"}>
                <span className="hu-calendar-connection-dot" aria-hidden="true" />
                {connection?.calendarName ?? "Google Calendar"}
              </span>
              <button aria-label="Refresh Google Calendar" className="hu-calendar-icon-button" disabled={isRefreshing} type="button" onClick={() => void refresh()}>
                <RefreshCw aria-hidden="true" size={14} className={isRefreshing ? "is-spinning" : ""} />
              </button>
              <button className="hu-calendar-add-button" type="button" onClick={beginCreate}>
                <Plus aria-hidden="true" size={14} />
                Add event
              </button>
            </>
          ) : (
            <button className="hu-calendar-connect-button" type="button" onClick={() => { window.location.href = getAppPath("/api/google/calendar/connect"); }}>
              <CalendarDays aria-hidden="true" size={14} />
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>

      {error ? <div className="hu-calendar-alert" role="alert">{error}</div> : null}

      {!isConnected && !isLoading ? (
        <div className="hu-calendar-empty">
          <CalendarDays aria-hidden="true" size={22} />
          <strong>See your day in HeavyUser</strong>
          <p>Connect one Google Calendar to bring your commitments into the planner.</p>
          <button className="hu-calendar-connect-button" type="button" onClick={() => { window.location.href = getAppPath("/api/google/calendar/connect"); }}>
            Connect Google Calendar
          </button>
        </div>
      ) : null}

      {isConnected ? <div className="hu-calendar-body">
        {allDayEvents.length > 0 ? (
          <div className="hu-calendar-all-day" aria-label="All-day events">
            <span>All day</span>
            <div>
              {allDayEvents.map((event) => (
                <button className="hu-all-day-event" key={event.id} type="button" onClick={() => beginEdit(event)}>
                  {event.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="hu-timeline">
          <div className="hu-time-labels" aria-hidden="true">
            {timeLabels.map((label, index) => (
              <span className="hu-time-label" key={label} style={{ top: `${(index / timelineHours) * 100}%` }}>
                {label}
              </span>
            ))}
          </div>
          <div className="hu-calendar-stage" role="list" aria-label={`Planner for ${date}`} style={{ "--hu-visible-hours": timelineHours } as CSSProperties}>
            <span className="hu-now-line" style={{ top: `${((currentTime - timelineStart) / timelineHours) * 100}%` }}>
              <span className="hu-now-label">{currentTimeLabel}</span>
            </span>

            {timedEvents.map((event) => {
              const range = getEventRange(event, date, timeZone);
              if (!range) return null;
              const start = range.start / 60;
              const end = range.end / 60;
              return (
                <button
                  className={`hu-event hu-event-button ${event.hasAttendees ? "is-guest-event" : ""}`}
                  key={event.id}
                  role="listitem"
                  style={{
                    top: `${Math.max(((start - timelineStart) / timelineHours) * 100, 0)}%`,
                    height: `${Math.min(((end - start) / timelineHours) * 100, 100)}%`,
                  }}
                  type="button"
                  onClick={() => beginEdit(event)}
                >
                  <span className="hu-event-title">{event.title}</span>
                  <span className="hu-event-meta">{formatEventTime(event, timeZone)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div> : null}

      {isCalendarPickerOpen ? (
        <div className="hu-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCalendarPickerOpen(false); }}>
          <div aria-labelledby="google-calendar-picker-title" className="hu-calendar-picker" role="dialog" aria-modal="true">
            <button aria-label="Close calendar picker" className="hu-task-dialog-close hu-icon-button" type="button" onClick={() => setIsCalendarPickerOpen(false)}>
              <X aria-hidden="true" />
            </button>
            <span className="hu-calendar-kicker">Google Calendar</span>
            <h2 id="google-calendar-picker-title">Choose one calendar</h2>
            <p>HeavyUser will read and update this calendar. You can change it later.</p>
            <div className="hu-calendar-option-list">
              {calendarOptions.map((calendar) => (
                <button className="hu-calendar-option" disabled={isSaving} key={calendar.id} type="button" onClick={() => void chooseCalendar(calendar.id)}>
                  <span className="hu-calendar-option-color" style={{ background: calendar.backgroundColor ?? "var(--primary)" }} aria-hidden="true" />
                  <span><strong>{calendar.name}</strong><small>{calendar.primary ? "Primary calendar" : calendar.timeZone ?? "Google Calendar"}</small></span>
                  {connection?.calendarId === calendar.id ? <Check aria-hidden="true" size={15} /> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isCreating || editingEvent ? (
        <div className="hu-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setIsCreating(false); setEditingEvent(null); } }}>
          <form aria-labelledby="google-event-dialog-title" className="hu-calendar-event-dialog" role="dialog" aria-modal="true" onSubmit={handleSave}>
            <button aria-label="Close event editor" className="hu-task-dialog-close hu-icon-button" type="button" onClick={() => { setIsCreating(false); setEditingEvent(null); }}>
              <X aria-hidden="true" />
            </button>
            <span className="hu-calendar-kicker">Google Calendar</span>
            <h2 id="google-event-dialog-title">{isCreating ? "Add event" : "Event details"}</h2>
            {editingEvent?.hasAttendees ? <div className="hu-calendar-readonly-note">This event has guests, so HeavyUser keeps it read-only.</div> : null}
            {editingEvent?.allDay ? <div className="hu-calendar-readonly-note">All-day event editing will be available in a later release.</div> : null}
            <label>Title<input disabled={Boolean(editingEvent?.hasAttendees || editingEvent?.allDay)} required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <div className="hu-calendar-event-grid">
              <label>Start<input disabled={Boolean(editingEvent?.hasAttendees || editingEvent?.allDay)} required type="datetime-local" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} /></label>
              <label>End<input disabled={Boolean(editingEvent?.hasAttendees || editingEvent?.allDay)} required type="datetime-local" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} /></label>
            </div>
            <label>Location<input disabled={Boolean(editingEvent?.hasAttendees || editingEvent?.allDay)} value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} /></label>
            <label>Notes<textarea disabled={Boolean(editingEvent?.hasAttendees || editingEvent?.allDay)} rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <div className="hu-calendar-dialog-actions">
              {editingEvent?.htmlLink ? <a className="hu-calendar-open-link" href={editingEvent.htmlLink} rel="noreferrer" target="_blank"><ExternalLink aria-hidden="true" size={13} />Open in Google</a> : <span />}
              {!editingEvent?.hasAttendees && !editingEvent?.allDay && editingEvent ? <button className="hu-calendar-delete-button" disabled={isSaving} type="button" onClick={() => void handleDelete()}><Trash2 aria-hidden="true" size={13} />Delete</button> : null}
              {editingEvent?.hasAttendees || editingEvent?.allDay ? <button className="hu-calendar-add-button" type="button" onClick={() => { setIsCreating(false); setEditingEvent(null); }}>Close</button> : <button className="hu-calendar-add-button" disabled={isSaving} type="submit"><Pencil aria-hidden="true" size={13} />{isSaving ? "Saving…" : "Save event"}</button>}
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
