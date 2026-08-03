"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays, Check, ExternalLink, Pencil, Plus, RefreshCw, Trash2, Video, X } from "lucide-react";
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
  meetingUrl: string | null;
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
  isTaskBlock: boolean;
  taskId: string | null;
  scheduleBlockId: string | null;
};

type EventDraft = {
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
};

type EventGestureMode = "move" | "resize-start" | "resize-end";

type EventGesture = {
  event: LiveEvent;
  mode: EventGestureMode;
  pointerId: number;
  originClientY: number;
  originPointerMinutes: number;
  originStart: number;
  originEnd: number;
  stage: HTMLElement;
  timelineHours: number;
};

type DragPreview = {
  eventId: string;
  start: string;
  end: string;
};

type PendingEventRange = {
  start: string;
  end: string;
};

type GoogleCalendarPanelProps = {
  date: string;
};

const VISIBLE_TIMELINE_HOURS = 8;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

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

function getEventRange(event: LiveEvent, timelineStart: number, timelineEnd: number) {
  if (!event.start || !event.end || event.allDay) {
    return null;
  }

  const eventStart = new Date(event.start).getTime();
  const eventEnd = new Date(event.end).getTime();
  if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd) || eventEnd <= timelineStart || eventStart >= timelineEnd) {
    return null;
  }

  const visibleStart = Math.max(eventStart, timelineStart);
  const visibleEnd = Math.min(eventEnd, timelineEnd);
  return {
    start: (visibleStart - timelineStart) / MINUTE_MS,
    end: Math.max((visibleEnd - timelineStart) / MINUTE_MS, (visibleStart - timelineStart) / MINUTE_MS + 15),
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

function getDraftDurationMinutes(start: string, end: string) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
    return null;
  }

  return Math.round((endTime - startTime) / 60_000);
}

function addMinutesToDateTimeInput(value: string, minutes: number) {
  const startTime = new Date(value);
  if (Number.isNaN(startTime.getTime())) {
    return "";
  }

  return toDateTimeInput(new Date(startTime.getTime() + minutes * 60_000).toISOString());
}

function snapMinutes(value: number) {
  return Math.round(value / 15) * 15;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getMinutesAtPointer(clientY: number, stage: HTMLElement, timelineHours: number) {
  const bounds = stage.getBoundingClientRect();
  if (bounds.height <= 0) {
    return 0;
  }

  return ((clientY - bounds.top) / bounds.height) * timelineHours * 60;
}

function fromDateTimeInput(value: string) {
  return new Date(value).toISOString();
}

function defaultDraft(date: string): EventDraft {
  return { title: "", description: "", location: "", start: `${date}T10:00`, end: `${date}T10:30` };
}

export function GoogleCalendarPanel({
  date,
}: GoogleCalendarPanelProps) {
  const timelineHours = VISIBLE_TIMELINE_HOURS;
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
  const didInitialLoad = useRef(false);
  const syncInFlight = useRef(false);
  const queuedSync = useRef(false);
  const [eventGesture, setEventGesture] = useState<EventGesture | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const eventGestureRef = useRef<EventGesture | null>(null);
  const gestureMoved = useRef(false);
  const suppressEventClick = useRef(false);
  const dragWriteChain = useRef(Promise.resolve());
  const pendingEventRanges = useRef(new Map<string, PendingEventRange>());
  const pendingEventRangeTimers = useRef(new Map<string, number>());

  useEffect(() => {
    const updateNow = () => setNowTimestamp(Date.now());
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const isConnected = Boolean(connection?.calendarId);
  const timeZone = connection?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentLocalParts = getDateParts(new Date(nowTimestamp), timeZone);
  const timelineStartTimestamp = nowTimestamp - ((currentLocalParts.minutes % 60) + 60) * MINUTE_MS;
  const timelineEndTimestamp = timelineStartTimestamp + timelineHours * HOUR_MS;
  const currentTimeLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(nowTimestamp));
  const timeLabelFormatter = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const timeLabels = Array.from({ length: timelineHours + 1 }, (_, index) => (
    timeLabelFormatter.format(new Date(timelineStartTimestamp + index * HOUR_MS))
  ));

  const visibleLiveEvents = useMemo(() => {
    return events.filter((event) => {
      if (event.allDay) {
        return Boolean(event.startDate && event.endDate && event.startDate <= date && event.endDate > date);
      }
      return Boolean(getEventRange(event, timelineStartTimestamp, timelineEndTimestamp));
    });
  }, [date, events, timelineEndTimestamp, timelineStartTimestamp]);

  function mergePendingEventRanges(nextEvents: LiveEvent[]) {
    return nextEvents.map((event) => {
      const pending = pendingEventRanges.current.get(event.id);
      if (!pending) {
        return event;
      }

      const matchesGoogle = event.start !== null && event.end !== null
        && new Date(event.start).getTime() === new Date(pending.start).getTime()
        && new Date(event.end).getTime() === new Date(pending.end).getTime();
      if (matchesGoogle) {
        pendingEventRanges.current.delete(event.id);
        const timer = pendingEventRangeTimers.current.get(event.id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          pendingEventRangeTimers.current.delete(event.id);
        }
        return event;
      }

      // Google can briefly return the previous value while its change is
      // propagating. Keep the successful local move visible until Google
      // confirms the same range instead of flashing the event backward.
      return { ...event, start: pending.start, end: pending.end };
    });
  }

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
    if (syncInFlight.current) {
      queuedSync.current = true;
      return;
    }

    syncInFlight.current = true;
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
      setEvents(mergePendingEventRanges(eventsBody?.events ?? []));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Calendar could not be loaded.");
    } finally {
      syncInFlight.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
      if (queuedSync.current) {
        queuedSync.current = false;
        void loadConnectionAndEvents(false);
      }
    }
  }

  useEffect(() => {
    if (didInitialLoad.current) {
      return;
    }
    didInitialLoad.current = true;

    // The async loader owns its state transitions after the network response.
    void loadConnectionAndEvents();
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("google_calendar") === "select") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // The loader intentionally runs once when the planner mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const syncWhenVisible = () => {
      if (document.visibilityState !== "visible" || editingEvent || isCreating || isSaving || eventGesture) {
        return;
      }

      void loadConnectionAndEvents(false);
    };
    const interval = window.setInterval(syncWhenVisible, 30_000);
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
    // The sync callback intentionally uses the latest modal state while the connection is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEvent, eventGesture, isConnected, isCreating, isSaving]);

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
    if (!editingEvent || !window.confirm(`${editingEvent.isTaskBlock ? "Reschedule" : "Delete"} “${editingEvent.title}” ${editingEvent.isTaskBlock ? "from this time?" : "from Google Calendar?"}`)) {
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
    if (syncInFlight.current) {
      return;
    }

    setIsRefreshing(true);
    await loadConnectionAndEvents(false);
  }

  function getGestureRange(gesture: EventGesture, clientY: number) {
    const pointerMinutes = snapMinutes(getMinutesAtPointer(clientY, gesture.stage, gesture.timelineHours));
    let deltaMinutes = pointerMinutes - gesture.originPointerMinutes;
    const minimumDuration = 15 * 60_000;
    let start = gesture.originStart;
    let end = gesture.originEnd;

    if (gesture.mode === "move") {
      deltaMinutes = snapMinutes(deltaMinutes);
      start += deltaMinutes * 60_000;
      end += deltaMinutes * 60_000;
    } else if (gesture.mode === "resize-start") {
      start = clamp(gesture.originStart + snapMinutes(deltaMinutes) * 60_000, gesture.originStart - 24 * 60 * 60_000, gesture.originEnd - minimumDuration);
    } else {
      end = clamp(gesture.originEnd + snapMinutes(deltaMinutes) * 60_000, gesture.originStart + minimumDuration, gesture.originEnd + 24 * 60 * 60_000);
    }

    return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
  }

  function startEventGesture(event: ReactPointerEvent<HTMLElement>, eventItem: LiveEvent, mode: EventGestureMode) {
    if (eventItem.allDay || !eventItem.start || !eventItem.end) {
      return;
    }

    const stage = event.currentTarget.closest(".hu-calendar-stage");
    if (!(stage instanceof HTMLElement)) {
      return;
    }

    if (mode !== "move") {
      event.preventDefault();
      suppressEventClick.current = true;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers do not allow capture on a nested resize handle.
    }
    gestureMoved.current = false;
    const gesture = {
      event: eventItem,
      mode,
      pointerId: event.pointerId,
      originClientY: event.clientY,
      originPointerMinutes: snapMinutes(getMinutesAtPointer(event.clientY, stage, timelineHours)),
      originStart: new Date(eventItem.start).getTime(),
      originEnd: new Date(eventItem.end).getTime(),
      stage,
      timelineHours,
    } satisfies EventGesture;
    eventGestureRef.current = gesture;
    setEventGesture(gesture);
    setDragPreview({ eventId: eventItem.id, start: eventItem.start, end: eventItem.end });
  }

  async function performDraggedEventSave(eventItem: LiveEvent, start: string, end: string) {
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(getAppPath("/api/google/calendar/events"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventKey: eventItem.id,
          source: "timeline",
          etag: eventItem.etag,
          title: eventItem.title,
          description: eventItem.description ?? "",
          location: eventItem.location ?? "",
          start,
          end,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The event could not be moved.");
      }
      // The timeline already reflects the new range optimistically. Release the
      // interaction lock as soon as Google accepts the write; the read sync can
      // finish in the background without preventing another drag.
      setIsSaving(false);
      void loadConnectionAndEvents(false);
    } catch (moveError) {
      const pending = pendingEventRanges.current.get(eventItem.id);
      if (pending?.start === start && pending.end === end) {
        pendingEventRanges.current.delete(eventItem.id);
        const timer = pendingEventRangeTimers.current.get(eventItem.id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          pendingEventRangeTimers.current.delete(eventItem.id);
        }
      }
      setError(moveError instanceof Error ? moveError.message : "The event could not be moved.");
      void loadConnectionAndEvents(false);
    } finally {
      setIsSaving(false);
    }
  }

  function saveDraggedEvent(eventItem: LiveEvent, start: string, end: string) {
    // Keep direct-manipulation writes in order. This prevents two quick drags
    // from racing Google Calendar's If-Match check while keeping the UI free.
    const operation = dragWriteChain.current.then(() => performDraggedEventSave(eventItem, start, end));
    dragWriteChain.current = operation.catch(() => undefined);
    return operation;
  }

  function handleEventClick(eventItem: LiveEvent) {
    if (suppressEventClick.current) {
      suppressEventClick.current = false;
      return;
    }

    beginEdit(eventItem);
  }

  useEffect(() => {
    const updateGesture = (event: PointerEvent) => {
      const gesture = eventGestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      const moved = Math.abs(event.clientY - gesture.originClientY) > 4;
      if (moved) {
        gestureMoved.current = true;
        suppressEventClick.current = true;
        event.preventDefault();
      }
      setDragPreview({ eventId: gesture.event.id, ...getGestureRange(gesture, event.clientY) });
    };

    const finishGesture = (event: PointerEvent, cancelled = false) => {
      const gesture = eventGestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      const finalRange = getGestureRange(gesture, event.clientY);
      const didMove = gestureMoved.current || finalRange.start !== gesture.event.start || finalRange.end !== gesture.event.end;
      const shouldSuppressClick = cancelled || didMove || gesture.mode !== "move";
      if (shouldSuppressClick) {
        suppressEventClick.current = true;
      }
      eventGestureRef.current = null;
      setEventGesture(null);

      if (!cancelled && didMove) {
        // Commit the visual move immediately so a second drag starts from the
        // new range even while the first Google write is still finishing.
        const previousTimer = pendingEventRangeTimers.current.get(gesture.event.id);
        if (previousTimer !== undefined) {
          window.clearTimeout(previousTimer);
        }
        pendingEventRanges.current.set(gesture.event.id, {
          start: finalRange.start,
          end: finalRange.end,
        });
        const timer = window.setTimeout(() => {
          const pending = pendingEventRanges.current.get(gesture.event.id);
          if (pending?.start === finalRange.start && pending.end === finalRange.end) {
            pendingEventRanges.current.delete(gesture.event.id);
            pendingEventRangeTimers.current.delete(gesture.event.id);
          }
        }, 60_000);
        pendingEventRangeTimers.current.set(gesture.event.id, timer);
        setEvents((currentEvents) => currentEvents.map((currentEvent) => (
          currentEvent.id === gesture.event.id
            ? { ...currentEvent, start: finalRange.start, end: finalRange.end }
            : currentEvent
        )));
        setDragPreview(null);
        void saveDraggedEvent(gesture.event, finalRange.start, finalRange.end);
      } else {
        setDragPreview(null);
      }

      window.setTimeout(() => {
        suppressEventClick.current = false;
      }, 0);
    };
    const cancelGesture = (event: PointerEvent) => finishGesture(event, true);

    window.addEventListener("pointermove", updateGesture, { passive: false });
    window.addEventListener("pointerup", finishGesture);
    window.addEventListener("pointercancel", cancelGesture);

    return () => {
      window.removeEventListener("pointermove", updateGesture);
      window.removeEventListener("pointerup", finishGesture);
      window.removeEventListener("pointercancel", cancelGesture);
      eventGestureRef.current = null;
    };
    // These listeners stay mounted for the calendar lifetime so a fast pointer move cannot be missed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <span className="hu-now-line" style={{ top: `${clamp(((nowTimestamp - timelineStartTimestamp) / (timelineHours * HOUR_MS)) * 100, 0, 100)}%` }}>
              <span className="hu-now-label">{currentTimeLabel}</span>
            </span>

            {timedEvents.map((event) => {
              const renderedEvent = dragPreview?.eventId === event.id
                ? { ...event, start: dragPreview.start, end: dragPreview.end }
                : event;
              const range = getEventRange(renderedEvent, timelineStartTimestamp, timelineEndTimestamp);
              if (!range) return null;
              return (
                <button
                  className={`hu-event hu-event-button ${event.hasAttendees ? "is-guest-event" : ""} ${event.isTaskBlock ? "is-task-block" : ""} ${eventGesture?.event.id === event.id ? "is-gesture-active" : ""}`}
                  key={event.id}
                  role="listitem"
                  style={{
                    top: `${(range.start / (timelineHours * 60)) * 100}%`,
                    height: `${((range.end - range.start) / (timelineHours * 60)) * 100}%`,
                  }}
                  title={event.meetingUrl ? "Video meeting available. Open the event for details." : event.isTaskBlock ? "Drag to move and lock this task block. Delete it to reschedule." : "Drag to move. Drag the top or bottom edge to change the time."}
                  type="button"
                  onPointerDown={(pointerEvent) => startEventGesture(pointerEvent, event, "move")}
                  onClick={() => handleEventClick(event)}
                >
                  <span
                    aria-hidden="true"
                    className="hu-event-resize-handle hu-event-resize-handle-start"
                    onPointerDown={(pointerEvent) => {
                      pointerEvent.stopPropagation();
                      startEventGesture(pointerEvent, event, "resize-start");
                    }}
                  />
                  <span className="hu-event-heading">
                    <span className="hu-event-title">{event.title}</span>
                    {event.meetingUrl ? (
                      <span aria-label="Video meeting available" className="hu-event-meeting" title="Video meeting available">
                        <Video aria-hidden="true" size={12} />
                      </span>
                    ) : null}
                  </span>
                  <span className="hu-event-meta">{formatEventTime(renderedEvent, timeZone)}</span>
                  <span
                    aria-hidden="true"
                    className="hu-event-resize-handle hu-event-resize-handle-end"
                    onPointerDown={(pointerEvent) => {
                      pointerEvent.stopPropagation();
                      startEventGesture(pointerEvent, event, "resize-end");
                    }}
                  />
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
            {editingEvent?.isTaskBlock ? <div className="hu-calendar-readonly-note">Moving or editing this task block locks it in place. Deleting it will reschedule the work.</div> : null}
            {editingEvent?.hasAttendees ? <div className="hu-calendar-readonly-note">This meeting has guests. Google may notify them when you save a change.</div> : null}
            {editingEvent?.allDay ? <div className="hu-calendar-readonly-note">All-day event editing will be available in a later release.</div> : null}
            <label>Title<input disabled={Boolean(editingEvent?.allDay)} required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <div className="hu-calendar-event-grid">
              <label>Start<input disabled={Boolean(editingEvent?.allDay)} required type="datetime-local" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} /></label>
              <label>End<input disabled={Boolean(editingEvent?.allDay)} required type="datetime-local" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} /></label>
            </div>
            <label>Duration (minutes)<input disabled={Boolean(editingEvent?.allDay)} min="5" max="1440" step="5" type="number" value={getDraftDurationMinutes(draft.start, draft.end) ?? ""} onChange={(event) => {
              const minutes = Number(event.target.value);
              if (Number.isFinite(minutes) && minutes > 0) {
                setDraft((current) => ({ ...current, end: addMinutesToDateTimeInput(current.start, minutes) }));
              }
            }} /></label>
            <label>Location<input disabled={Boolean(editingEvent?.allDay)} value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} /></label>
            {editingEvent?.meetingUrl ? (
              <a className="hu-calendar-meeting-link" href={editingEvent.meetingUrl} rel="noreferrer" target="_blank">
                <Video aria-hidden="true" size={14} />
                Open video meeting
                <ExternalLink aria-hidden="true" size={12} />
              </a>
            ) : null}
            <label>Notes<textarea disabled={Boolean(editingEvent?.allDay)} rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <div className="hu-calendar-dialog-actions">
              {editingEvent?.htmlLink ? <a className="hu-calendar-open-link" href={editingEvent.htmlLink} rel="noreferrer" target="_blank"><ExternalLink aria-hidden="true" size={13} />Open in Google</a> : <span />}
              {!editingEvent?.hasAttendees && !editingEvent?.allDay && editingEvent ? <button className="hu-calendar-delete-button" disabled={isSaving} type="button" onClick={() => void handleDelete()}><Trash2 aria-hidden="true" size={13} />{editingEvent.isTaskBlock ? "Reschedule" : "Delete"}</button> : null}
              {editingEvent?.allDay ? <button className="hu-calendar-add-button" type="button" onClick={() => { setIsCreating(false); setEditingEvent(null); }}>Close</button> : <button className="hu-calendar-add-button" disabled={isSaving} type="submit"><Pencil aria-hidden="true" size={13} />{isSaving ? "Saving…" : "Save event"}</button>}
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
