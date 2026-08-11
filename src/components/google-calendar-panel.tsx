"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, Pencil, Plus, RefreshCw, Trash2, Video, X } from "lucide-react";
import { getAppPath } from "@/lib/supabase/config";
import { dedupePlannerEvents } from "@/lib/google/event-utils";
import type { ScheduleBlockSnapshot } from "@/lib/scheduler/types";
import type { UserSettings } from "@/lib/supabase/settings";
import type { Task } from "@/lib/tasks";
import type { Space } from "@/lib/spaces";
import { focusFirstElement, trapTabKey } from "@/lib/accessibility/focus";

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
  calendarId: string | null;
  spaceId: string | null;
  spaceName: string | null;
  subSpaceName: string | null;
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
  transparency?: "opaque" | "transparent" | null;
  visibility?: string | null;
  isPlannerSynthetic?: boolean;
  isActiveTimerBlock?: boolean;
};

function getLiveEventKey(event: Pick<LiveEvent, "id" | "calendarId">) {
  return `${event.calendarId ?? ""}:${event.id}`;
}

function getLiveProviderKey(event: Pick<LiveEvent, "providerEventId" | "calendarId">) {
  return `${event.calendarId ?? ""}:${event.providerEventId}`;
}

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

type TimelineSwipe = {
  pointerId: number;
  startX: number;
  startY: number;
};

type TimelineTouch = {
  startX: number;
  startY: number;
};

type PendingEventRange = {
  start: string;
  end: string;
};

type PendingDeletedEvent = {
  calendarId: string | null;
  providerEventId: string;
  timer: number;
};

type GoogleCalendarPanelProps = {
  date: string;
  settings: UserSettings;
  tasks: ReadonlyArray<Task>;
  spaces: ReadonlyArray<Space>;
  scheduleBlocks: Readonly<Record<string, ReadonlyArray<ScheduleBlockSnapshot>>>;
  activeBlockId?: string | null;
  schedulerError?: string;
  onTaskDurationChange?: (taskId: string, previousDuration: number | null, duration: number) => void;
  onSpacesChange?: (spaces: ReadonlyArray<Space>) => void;
};

const TIMELINE_HOURS = 24;
const TIMELINE_HOUR_HEIGHT = 56;
const DAY_MARKER_HEIGHT = 42;
const PLANNER_DAYS = 3;
const SCROLL_RETURN_THRESHOLD = 48;
const CURRENT_TIME_BEFORE_MINUTES = 60;
const CURRENT_TIME_AFTER_MINUTES = 7 * 60;
const CURRENT_TIME_WINDOW_HOURS = (CURRENT_TIME_BEFORE_MINUTES + CURRENT_TIME_AFTER_MINUTES) / 60;
const MIN_EVENT_DURATION_MINUTES = 5;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function formatDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function getDateTimeParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
    seconds: Number(values.second),
  };
}

function getTimestampForLocalDateTime(date: string, minutes: number, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const localParts = getDateTimeParts(new Date(utcGuess), timeZone);
  const localAsUtc = Date.UTC(
    Number(localParts.date.slice(0, 4)),
    Number(localParts.date.slice(5, 7)) - 1,
    Number(localParts.date.slice(8, 10)),
    Math.floor(localParts.minutes / 60),
    localParts.minutes % 60,
    localParts.seconds,
  );
  return utcGuess + (utcGuess - localAsUtc);
}

function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function getTimeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatDayButtonLabel(value: string, today: string) {
  if (value === today) {
    return "Today";
  }
  if (value === addCalendarDays(today, 1)) {
    return "Tomorrow";
  }
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short" });
}

function formatStartTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(date);
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
    end: (visibleEnd - timelineStart) / MINUTE_MS,
  };
}

function formatEventTime(event: LiveEvent, timeZone: string) {
  if (event.allDay || !event.start || !event.end) {
    return "All day";
  }

  const formatter = new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(event.start))} – ${formatter.format(new Date(event.end))}`;
}

function toDateTimeInput(value: string | null, timeZone: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const parts = getDateTimeParts(date, timeZone);
  const hours = String(Math.floor(parts.minutes / 60)).padStart(2, "0");
  const minutes = String(parts.minutes % 60).padStart(2, "0");
  return `${parts.date}T${hours}:${minutes}`;
}

function getDraftDurationMinutes(start: string, end: string, timeZone: string) {
  const startTime = Date.parse(fromDateTimeInput(start, timeZone));
  const endTime = Date.parse(fromDateTimeInput(end, timeZone));
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
    return null;
  }

  return Math.round((endTime - startTime) / 60_000);
}

function addMinutesToDateTimeInput(value: string, minutes: number, timeZone: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return "";
  }

  const inputMinutes = Number(match[2]) * 60 + Number(match[3]);
  const timestamp = getTimestampForLocalDateTime(match[1], inputMinutes, timeZone) + minutes * MINUTE_MS;
  return toDateTimeInput(new Date(timestamp).toISOString(), timeZone);
}

function snapMinutes(value: number) {
  return Math.round(value / 15) * 15;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getCurrentTimeOffset(nowTimestamp: number, timelineStartTimestamp: number, hourHeight: number) {
  return Math.max(
    0,
    ((nowTimestamp - timelineStartTimestamp) / MINUTE_MS - CURRENT_TIME_BEFORE_MINUTES) * (hourHeight / 60),
  );
}

function getDayIndexAtScroll(scrollTop: number, dayBlockHeight: number) {
  return clamp(Math.floor((scrollTop + 8) / dayBlockHeight), 0, PLANNER_DAYS - 1);
}

function getDayTimeOffsetAtScroll(scrollTop: number, dayIndex: number, dayBlockHeight: number, dayHeight: number) {
  return clamp(scrollTop - dayIndex * dayBlockHeight - DAY_MARKER_HEIGHT, 0, dayHeight);
}

function getDayScrollTop(dayIndex: number, timeOffset: number, dayBlockHeight: number, dayHeight: number) {
  return dayIndex * dayBlockHeight + DAY_MARKER_HEIGHT + clamp(timeOffset, 0, dayHeight);
}

function getTimelineMarkerPosition(timestamp: number, timelineStartTimestamp: number, timelineEndTimestamp: number) {
  return clamp(((timestamp - timelineStartTimestamp) / (timelineEndTimestamp - timelineStartTimestamp)) * 100, 0, 100);
}

function getMinutesAtPointer(clientY: number, stage: HTMLElement, timelineHours: number) {
  const bounds = stage.getBoundingClientRect();
  if (bounds.height <= 0) {
    return 0;
  }

  return ((clientY - bounds.top) / bounds.height) * timelineHours * 60;
}

function fromDateTimeInput(value: string, timeZone: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return "";
  }

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return new Date(getTimestampForLocalDateTime(match[1], minutes, timeZone)).toISOString();
}

function defaultDraft(date: string): EventDraft {
  return { title: "", description: "", location: "", start: `${date}T10:00`, end: `${date}T10:30` };
}

export function GoogleCalendarPanel({
  date,
  settings,
  tasks,
  spaces,
  scheduleBlocks,
  schedulerError = "",
  onTaskDurationChange,
  onSpacesChange,
  activeBlockId = null,
}: GoogleCalendarPanelProps) {
  const timelineHours = TIMELINE_HOURS;
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [events, setEvents] = useState<ReadonlyArray<LiveEvent>>([]);
  const eventsRef = useRef<ReadonlyArray<LiveEvent>>([]);
  const [calendarOptions, setCalendarOptions] = useState<ReadonlyArray<CalendarOption>>([]);
  const [selectedSpaceFilter, setSelectedSpaceFilter] = useState("all");
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
  const [selectedDate, setSelectedDate] = useState(date);
  const [isTimelineAwayFromNow, setIsTimelineAwayFromNow] = useState(false);
  const [timelineViewportHeight, setTimelineViewportHeight] = useState(0);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineSwipeRef = useRef<TimelineSwipe | null>(null);
  const timelineTouchRef = useRef<TimelineTouch | null>(null);
  const eventGestureRef = useRef<EventGesture | null>(null);
  const gestureMoved = useRef(false);
  const suppressEventClick = useRef(false);
  const dragWriteChain = useRef(Promise.resolve());
  const pendingEventRanges = useRef(new Map<string, PendingEventRange>());
  const pendingEventRangeTimers = useRef(new Map<string, number>());
  const pendingLocalEvents = useRef(new Map<string, LiveEvent>());
  const pendingLocalEventTimers = useRef(new Map<string, number>());
  const pendingDeletedEvents = useRef(new Map<string, PendingDeletedEvent>());
  const modalDialogRef = useRef<HTMLElement | null>(null);
  const modalReturnFocusRef = useRef<HTMLElement | null>(null);
  const isEventDialogOpen = isCreating || Boolean(editingEvent);

  useEffect(() => {
    if (!isCalendarPickerOpen && !isEventDialogOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frameId = window.requestAnimationFrame(() => {
      const dialog = modalDialogRef.current;
      if (dialog && !dialog.contains(document.activeElement)) {
        focusFirstElement(dialog);
      }
    });

    function handleModalKeyDown(event: KeyboardEvent) {
      const dialog = modalDialogRef.current;
      if (event.key === "Tab" && dialog) {
        trapTabKey(event, dialog);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setIsCalendarPickerOpen(false);
        setIsCreating(false);
        setEditingEvent(null);
      }
    }

    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleModalKeyDown);
      const returnFocus = modalReturnFocusRef.current;
      modalReturnFocusRef.current = null;
      window.requestAnimationFrame(() => returnFocus?.focus());
    };
  }, [isCalendarPickerOpen, isEventDialogOpen]);

  useEffect(() => {
    const updateNow = () => setNowTimestamp(Date.now());
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // A disconnected Google account may still have archived or disconnected Space records. The
  // toolbar must follow the actual connection, not the saved Space list.
  const isConnected = Boolean(connection?.calendarId);
  const effectiveSpaceFilter = selectedSpaceFilter !== "all" && spaces.some((space) => space.id === selectedSpaceFilter)
    ? selectedSpaceFilter
    : "all";
  const timeZone = settings.planningTimezone || "UTC";
  const dayStartMinutes = settings.nightOwlMode ? getTimeMinutes(settings.dayStartTime) : 0;
  const timelineHourHeight = timelineViewportHeight > 0
    ? timelineViewportHeight / CURRENT_TIME_WINDOW_HOURS
    : TIMELINE_HOUR_HEIGHT;
  const timelineDayHeight = TIMELINE_HOURS * timelineHourHeight;
  const timelineDayBlockHeight = DAY_MARKER_HEIGHT + timelineDayHeight;
  const plannerDates = Array.from({ length: PLANNER_DAYS }, (_, index) => addCalendarDays(date, index));
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
  const currentDayStartTimestamp = getTimestampForLocalDateTime(date, dayStartMinutes, timeZone);
  const currentDayTimeOffset = getCurrentTimeOffset(nowTimestamp, currentDayStartTimestamp, timelineHourHeight);
  const selectedDateIndex = Math.max(0, plannerDates.indexOf(selectedDate));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const preferredScheduleBlockIds = new Set(
    events.map((event) => event.scheduleBlockId).filter((blockId): blockId is string => Boolean(blockId)),
  );
  const calendarEvents = dedupePlannerEvents(
    events
      // Task deletion is optimistic in the task workspace. Hide the provider
      // event immediately instead of waiting for scheduler/Google reconciliation
      // to remove the stale calendar row.
      .filter((event) => !event.isTaskBlock || Boolean(event.taskId && taskById.has(event.taskId)))
      .map((event) => {
        const task = event.isTaskBlock && event.taskId ? taskById.get(event.taskId) : null;
        const space = task?.spaceId ? spaces.find((candidate) => candidate.id === task.spaceId) : event.spaceId ? spaces.find((candidate) => candidate.id === event.spaceId) : null;
        const subSpace = task?.subSpaceId ? space?.subSpaces.find((candidate) => candidate.id === task.subSpaceId) : event.subSpaceName ? { name: event.subSpaceName } : null;
        const decorated = task ? { ...event, title: task.title, spaceId: task.spaceId, spaceName: space?.name ?? event.spaceName, subSpaceName: subSpace?.name ?? null } : event;
        return decorated.scheduleBlockId === activeBlockId ? { ...decorated, isActiveTimerBlock: true } : decorated;
      }),
    preferredScheduleBlockIds,
  );
  const calendarScheduleBlockIds = new Set(
    calendarEvents.map((event) => event.scheduleBlockId).filter((blockId): blockId is string => Boolean(blockId)),
  );
  const calendarProviderEventIds = new Set(calendarEvents.map((event) => getLiveProviderKey(event)));
  const scheduledBlockEvents = dedupePlannerEvents(
    Object.values(scheduleBlocks)
      .flat()
      .filter((block) => (
        block.state !== "cancelled"
        && block.state !== "replaced"
        && block.state !== "missed"
        && !calendarScheduleBlockIds.has(block.id)
        && (!block.providerEventId || !calendarProviderEventIds.has(`${block.calendarId ?? ""}:${block.providerEventId}`))
      ))
      .map((block): LiveEvent | null => {
        const task = taskById.get(block.taskId);
        if (!task) {
          return null;
        }
        const space = spaces.find((candidate) => candidate.id === task.spaceId);

        return {
          id: `heavyuser-schedule-block:${block.id}`,
          providerEventId: block.providerEventId ?? `heavyuser-schedule-block:${block.id}`,
          calendarId: block.calendarId,
          spaceId: task.spaceId,
          spaceName: space?.name ?? null,
          subSpaceName: space?.subSpaces.find((candidate) => candidate.id === task.subSpaceId)?.name ?? null,
          title: task.title,
          description: null,
          location: null,
          meetingUrl: null,
          start: block.start,
          end: block.end,
          startDate: null,
          endDate: null,
          allDay: false,
          hasAttendees: false,
          etag: null,
          htmlLink: null,
          timeZone,
          recurringEventId: null,
          isTaskBlock: true,
          taskId: task.id,
          scheduleBlockId: block.id,
          isPlannerSynthetic: true,
          isActiveTimerBlock: block.id === activeBlockId,
        };
      })
      .filter((event): event is LiveEvent => event !== null),
    preferredScheduleBlockIds,
  );
  // Do not draw a guessed block while the scheduler is working. A block is
  // shown only after Google accepted it and the saved schedule snapshot has
  // a matching block to render.
  const plannerEvents = dedupePlannerEvents(
    [...calendarEvents, ...scheduledBlockEvents],
    preferredScheduleBlockIds,
  );
  const isCrossSpaceBusyEvent = (event: LiveEvent) => effectiveSpaceFilter !== "all"
    && !event.isTaskBlock
    && event.spaceId !== effectiveSpaceFilter;
  const isReadOnlyEvent = (event: LiveEvent) => event.hasAttendees || isCrossSpaceBusyEvent(event);
  const visiblePlannerEvents = effectiveSpaceFilter === "all"
    ? plannerEvents
    : plannerEvents.filter((event) => event.spaceId === effectiveSpaceFilter || isCrossSpaceBusyEvent(event));
  const draftTimeZone = editingEvent?.timeZone
    ?? spaces.find((space) => space.id === effectiveSpaceFilter)?.timeZone
    ?? timeZone;

  const plannerTimelineDays = plannerDates.map((plannerDate) => {
    const timelineStartTimestamp = getTimestampForLocalDateTime(plannerDate, dayStartMinutes, timeZone);
    const timelineEndTimestamp = getTimestampForLocalDateTime(addCalendarDays(plannerDate, 1), dayStartMinutes, timeZone);
    const allDayEvents = visiblePlannerEvents.filter((event) => (
      event.allDay
      && Boolean(event.startDate && event.endDate && event.startDate <= plannerDate && event.endDate > plannerDate)
    ));
    const timedEvents = visiblePlannerEvents.filter((event) => (
      !event.allDay && Boolean(getEventRange(event, timelineStartTimestamp, timelineEndTimestamp))
    ));

    return {
      date: plannerDate,
      timelineStartTimestamp,
      timelineEndTimestamp,
      timeLabels: Array.from({ length: timelineHours + 1 }, (_, index) => (
        timeLabelFormatter.format(new Date(timelineStartTimestamp + index * HOUR_MS))
      )),
      allDayEvents,
      timedEvents,
    };
  });

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSelectedDate(date));
    return () => window.cancelAnimationFrame(frame);
  }, [date]);

  useLayoutEffect(() => {
    const scrollElement = timelineScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const measureViewport = () => {
      const nextHeight = scrollElement.clientHeight;
      if (nextHeight > 0) {
        setTimelineViewportHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
      }
    };

    measureViewport();
    const resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(scrollElement);
    return () => resizeObserver.disconnect();
  }, [isConnected]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scrollElement = timelineScrollRef.current;
      if (!scrollElement) {
        return;
      }

      const targetScrollTop = getDayScrollTop(0, currentDayTimeOffset, timelineDayBlockHeight, timelineDayHeight);
      scrollElement.scrollTo({ top: targetScrollTop, behavior: "auto" });
      setIsTimelineAwayFromNow(false);
    });

    return () => window.cancelAnimationFrame(frame);
    // Keep the user's scroll position stable as the clock ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, dayStartMinutes, isConnected, timeZone, timelineDayBlockHeight, timelineDayHeight]);

  function scrollToPlannerDay(targetDate: string, preserveTime = true) {
    const scrollElement = timelineScrollRef.current;
    const targetIndex = plannerDates.indexOf(targetDate);
    if (!scrollElement || targetIndex < 0) {
      return;
    }

    const currentIndex = getDayIndexAtScroll(scrollElement.scrollTop, timelineDayBlockHeight);
    const currentTimeOffset = getDayTimeOffsetAtScroll(scrollElement.scrollTop, currentIndex, timelineDayBlockHeight, timelineDayHeight);
    const targetTimeOffset = preserveTime ? currentTimeOffset : 0;
    scrollElement.scrollTo({ top: getDayScrollTop(targetIndex, targetTimeOffset, timelineDayBlockHeight, timelineDayHeight), behavior: "smooth" });
    setSelectedDate(targetDate);
  }

  function jumpToNow() {
    const scrollElement = timelineScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const targetScrollTop = getDayScrollTop(0, currentDayTimeOffset, timelineDayBlockHeight, timelineDayHeight);
    scrollElement.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    setSelectedDate(date);
    setIsTimelineAwayFromNow(false);
  }

  function handleTimelineScroll(scrollElement: HTMLDivElement) {
    const dayIndex = getDayIndexAtScroll(scrollElement.scrollTop, timelineDayBlockHeight);
    const nextDate = plannerDates[dayIndex];
    if (nextDate && nextDate !== selectedDate) {
      setSelectedDate(nextDate);
    }

    const currentTarget = getDayScrollTop(0, currentDayTimeOffset, timelineDayBlockHeight, timelineDayHeight);
    setIsTimelineAwayFromNow(Math.abs(scrollElement.scrollTop - currentTarget) > SCROLL_RETURN_THRESHOLD);
  }

  function handleHorizontalDaySwipe(deltaX: number, deltaY: number) {
    if (Math.abs(deltaX) < 56 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    const scrollElement = timelineScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const currentIndex = getDayIndexAtScroll(scrollElement.scrollTop, timelineDayBlockHeight);
    const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= plannerDates.length) {
      return;
    }

    scrollToPlannerDay(plannerDates[nextIndex], true);
  }

  function handleTimelinePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "pen") {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".hu-event, button")) {
      return;
    }

    timelineSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function handleTimelinePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = timelineSwipeRef.current;
    timelineSwipeRef.current = null;
    if (!swipe || swipe.pointerId !== event.pointerId) {
      return;
    }

    handleHorizontalDaySwipe(event.clientX - swipe.startX, event.clientY - swipe.startY);
  }

  function handleTimelinePointerCancel() {
    timelineSwipeRef.current = null;
  }

  function handleTimelineTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 1) {
      timelineTouchRef.current = null;
      return;
    }

    if (event.target instanceof Element && event.target.closest(".hu-event, button")) {
      return;
    }

    const touch = event.touches[0];
    timelineTouchRef.current = { startX: touch.clientX, startY: touch.clientY };
  }

  function handleTimelineTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = timelineTouchRef.current;
    timelineTouchRef.current = null;
    const changedTouch = event.changedTouches[0];
    if (!touch || !changedTouch) {
      return;
    }

    handleHorizontalDaySwipe(changedTouch.clientX - touch.startX, changedTouch.clientY - touch.startY);
  }

  function handleTimelineTouchCancel() {
    timelineTouchRef.current = null;
  }

  function mergePendingEventRanges(nextEvents: LiveEvent[]) {
    return nextEvents.map((event) => {
      const eventKey = getLiveEventKey(event);
      const pending = pendingEventRanges.current.get(eventKey);
      if (!pending) {
        return event;
      }

      const matchesGoogle = event.start !== null && event.end !== null
        && new Date(event.start).getTime() === new Date(pending.start).getTime()
        && new Date(event.end).getTime() === new Date(pending.end).getTime();
      if (matchesGoogle) {
        pendingEventRanges.current.delete(eventKey);
        const timer = pendingEventRangeTimers.current.get(eventKey);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          pendingEventRangeTimers.current.delete(eventKey);
        }
        return event;
      }

      // Google can briefly return the previous value while its change is
      // propagating. Keep the successful local move visible until Google
      // confirms the same range instead of flashing the event backward.
      return { ...event, start: pending.start, end: pending.end };
    });
  }

  function rememberPendingLocalEvent(event: LiveEvent) {
    const eventKey = getLiveEventKey(event);
    clearPendingDeletedEvent(eventKey);
    pendingLocalEvents.current.set(eventKey, event);
    const previousTimer = pendingLocalEventTimers.current.get(eventKey);
    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer);
    }
    const timer = window.setTimeout(() => {
      pendingLocalEvents.current.delete(eventKey);
      pendingLocalEventTimers.current.delete(eventKey);
    }, 60_000);
    pendingLocalEventTimers.current.set(eventKey, timer);
  }

  function clearPendingLocalEvent(eventId: string) {
    pendingLocalEvents.current.delete(eventId);
    const timer = pendingLocalEventTimers.current.get(eventId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      pendingLocalEventTimers.current.delete(eventId);
    }
  }

  function rememberPendingDeletedEvent(event: LiveEvent) {
    const eventKey = getLiveEventKey(event);
    const previous = pendingDeletedEvents.current.get(eventKey);
    if (previous) {
      window.clearTimeout(previous.timer);
    }

    const timer = window.setTimeout(() => {
      pendingDeletedEvents.current.delete(eventKey);
    }, 120_000);
    pendingDeletedEvents.current.set(eventKey, { calendarId: event.calendarId, providerEventId: event.providerEventId, timer });
  }

  function clearPendingDeletedEvent(eventId: string) {
    const pending = pendingDeletedEvents.current.get(eventId);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timer);
    pendingDeletedEvents.current.delete(eventId);
  }

  function mergePendingLocalEvents(nextEvents: LiveEvent[]) {
    const pendingDeletions = [...pendingDeletedEvents.current.entries()];
    const merged = new Map(nextEvents
      .filter((event) => !pendingDeletions.some(([eventKey, pending]) => getLiveEventKey(event) === eventKey || getLiveProviderKey(event) === getLiveProviderKey(pending)))
      .map((event) => [getLiveEventKey(event), event]));
    for (const [eventKey, pending] of pendingDeletions) {
      const deletionConfirmed = !nextEvents.some((event) => getLiveEventKey(event) === eventKey || getLiveProviderKey(event) === getLiveProviderKey(pending));
      if (deletionConfirmed) {
        clearPendingDeletedEvent(eventKey);
      }
    }

    for (const [eventKey, pendingEvent] of pendingLocalEvents.current) {
      const serverEvent = merged.get(eventKey);
      const isConfirmed = serverEvent
        && serverEvent.title === pendingEvent.title
        && serverEvent.start === pendingEvent.start
        && serverEvent.end === pendingEvent.end
        && serverEvent.description === pendingEvent.description
        && serverEvent.location === pendingEvent.location;
      if (isConfirmed) {
        clearPendingLocalEvent(eventKey);
      } else {
        merged.set(eventKey, pendingEvent);
      }
    }

    return [...merged.values()].sort((first, second) => {
      const firstStart = first.start ? new Date(first.start).getTime() : Number.POSITIVE_INFINITY;
      const secondStart = second.start ? new Date(second.start).getTime() : Number.POSITIVE_INFINITY;
      return firstStart - secondStart;
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
    modalReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsCalendarPickerOpen(true);
  }

  async function loadConnectionAndEvents(showSpinner = true, options: { sync?: boolean } = {}) {
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
      const connectionBody = (await connectionResponse.json().catch(() => null)) as { connection?: CalendarConnection | null; spaces?: ReadonlyArray<Space>; error?: string } | null;
      if (!connectionResponse.ok) {
        throw new Error(connectionBody?.error ?? "Calendar connection could not be checked.");
      }

      const nextConnection = connectionBody?.connection ?? null;
      if (connectionBody?.spaces) {
        onSpacesChange?.(connectionBody.spaces);
      }
      setConnection(nextConnection);
      if (!nextConnection?.calendarId) {
        setEvents([]);
        if (nextConnection?.status === "awaiting_calendar") {
          await loadCalendars();
        }
        return;
      }

      let syncConnection: CalendarConnection | undefined;
      let syncWarning = "";
      if (options.sync !== false) {
        const syncResponse = await fetch(getAppPath("/api/google/calendar/sync"), {
          method: "POST",
          cache: "no-store",
        });
        const syncBody = (await syncResponse.json().catch(() => null)) as { connection?: CalendarConnection; sync?: { errors?: ReadonlyArray<string>; truncated?: boolean }; error?: string } | null;
        if (!syncResponse.ok) {
          throw new Error(syncBody?.error ?? "Calendar events could not be synchronized.");
        }
        syncConnection = syncBody?.connection;
        if (syncBody?.sync?.errors?.length) {
          syncWarning = `Some Spaces could not be refreshed: ${syncBody.sync.errors.join(" ")}`;
        }
        if (syncBody?.sync?.truncated) {
          syncWarning = `${syncWarning ? `${syncWarning} ` : ""}Some calendar events were not loaded because the result was too large. Narrow the planner range or refresh again.`;
        }
      }

      const eventsRange = new URLSearchParams();
      const eventsTimeZone = timeZone;
      const eventsStartDate = plannerDates[0] ?? date;
      const eventsEndDate = addCalendarDays(eventsStartDate, PLANNER_DAYS);
      const eventsStart = getTimestampForLocalDateTime(eventsStartDate, dayStartMinutes, eventsTimeZone);
      const eventsEnd = getTimestampForLocalDateTime(eventsEndDate, dayStartMinutes, eventsTimeZone);
      eventsRange.set("start", new Date(eventsStart).toISOString());
      eventsRange.set("end", new Date(eventsEnd).toISOString());
      eventsRange.set("startDate", eventsStartDate);
      eventsRange.set("endDate", eventsEndDate);
      const eventsResponse = await fetch(`${getAppPath("/api/google/calendar/events")}?${eventsRange.toString()}`, { cache: "no-store" });
      const eventsBody = (await eventsResponse.json().catch(() => null)) as { events?: LiveEvent[]; connection?: CalendarConnection; spaces?: ReadonlyArray<Space>; truncated?: boolean; error?: string } | null;
      if (!eventsResponse.ok) {
        throw new Error(eventsBody?.error ?? "Calendar events could not be loaded.");
      }
      if (eventsBody?.spaces) {
        onSpacesChange?.(eventsBody.spaces);
      }
      setConnection(eventsBody?.connection ?? syncConnection ?? nextConnection);
      setEvents(mergePendingLocalEvents(mergePendingEventRanges(eventsBody?.events ?? [])));
      if (eventsBody?.truncated) {
        syncWarning = `${syncWarning ? `${syncWarning} ` : ""}Some calendar events were not loaded because the result was too large. Narrow the planner range or refresh again.`;
      }
      setError(syncWarning);
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
    window.addEventListener("heavyuser:calendar-refresh", syncWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("heavyuser:calendar-refresh", syncWhenVisible);
    };
    // The sync callback intentionally uses the latest modal state while the connection is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEvent, eventGesture, isConnected, isCreating, isSaving]);

  function beginCreate() {
    modalReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setIsCreating(true);
    setEditingEvent(null);
    setDraft(defaultDraft(selectedDate));
  }

  function beginEdit(event: LiveEvent) {
    if (event.isActiveTimerBlock) {
      setError("Stop the active timer before moving or resizing this block.");
      return;
    }
    modalReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setIsCreating(false);
    setEditingEvent(event);
    const eventTimeZone = event.timeZone ?? timeZone;
    setDraft({
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      start: toDateTimeInput(event.start, eventTimeZone),
      end: toDateTimeInput(event.end, eventTimeZone),
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
      const body = (await response.json().catch(() => null)) as { error?: string; spaces?: ReadonlyArray<Space>; syncError?: string | null; schedulerError?: string | null } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "That calendar could not be selected.");
      }
      if (body?.spaces) {
        onSpacesChange?.(body.spaces);
      }
      const followUpWarning = body?.syncError ?? body?.schedulerError;
      setIsCalendarPickerOpen(false);
      await loadConnectionAndEvents(false);
      if (followUpWarning) {
        setError(`Calendar selected. Background setup will retry: ${followUpWarning}`);
      }
      window.dispatchEvent(new Event("heavyuser:schedule-refresh"));
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "That calendar could not be selected.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingEvent && isReadOnlyEvent(editingEvent)) {
      setError("This event is read-only in HeavyUser. Open it in Google Calendar to make changes.");
      return;
    }
    if (!draft.title.trim() || !draft.start || !draft.end) {
      setError("Enter a title, start time, and end time.");
      return;
    }
    const targetSpace = effectiveSpaceFilter === "all"
      ? null
      : spaces.find((space) => space.id === effectiveSpaceFilter) ?? null;
    const draftTimeZone = editingEvent?.timeZone ?? targetSpace?.timeZone ?? timeZone;
    const draftStart = fromDateTimeInput(draft.start, draftTimeZone);
    const draftEnd = fromDateTimeInput(draft.end, draftTimeZone);
    if (!draftStart || !draftEnd || Date.parse(draftEnd) <= Date.parse(draftStart)) {
      setError("The end time must be after the start time.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      if (isCreating && effectiveSpaceFilter !== "all" && !targetSpace) {
        throw new Error("Choose an active Space before creating this event.");
      }
      const response = await fetch(getAppPath("/api/google/calendar/events"), {
        method: isCreating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCreating ? {
          title: draft.title,
          description: draft.description,
          location: draft.location,
          start: draftStart,
          end: draftEnd,
          ...(targetSpace ? { calendarId: targetSpace.calendarId } : {}),
        } : {
          eventKey: editingEvent?.id,
          calendarId: editingEvent?.calendarId,
          etag: editingEvent?.etag,
          title: draft.title,
          description: draft.description,
          location: draft.location,
          start: draftStart,
          end: draftEnd,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; event?: LiveEvent } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The event could not be saved.");
      }
      const savedEvent = body?.event;
      if (savedEvent) {
        rememberPendingLocalEvent(savedEvent);
        const savedEventKey = getLiveEventKey(savedEvent);
        setEvents((currentEvents) => mergePendingLocalEvents([
          ...currentEvents.filter((currentEvent) => getLiveEventKey(currentEvent) !== savedEventKey),
          savedEvent,
        ]));
      }
      setEditingEvent(null);
      setIsCreating(false);
      window.dispatchEvent(new Event("heavyuser:schedule-refresh"));
      void loadConnectionAndEvents(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The event could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (editingEvent && isReadOnlyEvent(editingEvent)) {
      setError("This event is read-only in HeavyUser. Open it in Google Calendar to make changes.");
      return;
    }
    if (!editingEvent || !window.confirm(`${editingEvent.isTaskBlock ? "Reschedule" : "Delete"} “${editingEvent.title}” ${editingEvent.isTaskBlock ? "from this time?" : "from Google Calendar?"}`)) {
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const deleteParams = new URLSearchParams();
      if (editingEvent.isPlannerSynthetic && editingEvent.scheduleBlockId) {
        deleteParams.set("scheduleBlockId", editingEvent.scheduleBlockId);
      } else {
        deleteParams.set("eventKey", editingEvent.id);
      }
      if (editingEvent.calendarId) deleteParams.set("calendarId", editingEvent.calendarId);
      const response = await fetch(`${getAppPath("/api/google/calendar/events")}?${deleteParams.toString()}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The event could not be deleted.");
      }
      rememberPendingDeletedEvent(editingEvent);
      const editingEventKey = getLiveEventKey(editingEvent);
      clearPendingLocalEvent(editingEventKey);
      setEvents((currentEvents) => mergePendingLocalEvents(currentEvents.filter((currentEvent) => getLiveEventKey(currentEvent) !== editingEventKey)));
      setEditingEvent(null);
      window.dispatchEvent(new Event("heavyuser:schedule-refresh"));
      // The delete route already removed the cache row. Read that cache back
      // without immediately asking Google for a list response that may still
      // contain the just-deleted event while propagation finishes.
      void loadConnectionAndEvents(false, { sync: false });
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
    const minimumDuration = MIN_EVENT_DURATION_MINUTES * MINUTE_MS;
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
    if (isReadOnlyEvent(eventItem)) {
      return;
    }
    if (eventItem.isActiveTimerBlock) {
      event.preventDefault();
      setError("Stop the active timer before moving or resizing this block.");
      return;
    }
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
    setDragPreview({ eventId: getLiveEventKey(eventItem), start: eventItem.start, end: eventItem.end });
  }

  async function performDraggedEventSave(eventItem: LiveEvent, start: string, end: string, mode: EventGestureMode) {
    if (isReadOnlyEvent(eventItem)) {
      setError("This event is read-only in HeavyUser. Open it in Google Calendar to make changes.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(getAppPath("/api/google/calendar/events"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventKey: eventItem.id,
          calendarId: eventItem.calendarId,
          source: "timeline",
          etag: eventItem.etag,
          title: eventItem.title,
          description: eventItem.description ?? "",
          location: eventItem.location ?? "",
          start,
          end,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; event?: LiveEvent } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The event could not be moved.");
      }
      const savedEvent = body?.event;
      const eventKey = getLiveEventKey(eventItem);
      if (savedEvent) {
        eventsRef.current = eventsRef.current.map((currentEvent) => (
          getLiveEventKey(currentEvent) === eventKey
            ? { ...currentEvent, ...savedEvent, start, end }
            : currentEvent
        ));
        setEvents((currentEvents) => currentEvents.map((currentEvent) => (
          getLiveEventKey(currentEvent) === eventKey
            ? { ...currentEvent, ...savedEvent, start, end }
            : currentEvent
        )));
      }
      if (mode !== "move" && eventItem.isTaskBlock && eventItem.taskId) {
        const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / MINUTE_MS);
        if (Number.isFinite(duration) && duration >= MIN_EVENT_DURATION_MINUTES) {
          const previousDuration = eventItem.start && eventItem.end
            ? Math.round((new Date(eventItem.end).getTime() - new Date(eventItem.start).getTime()) / MINUTE_MS)
            : null;
          onTaskDurationChange?.(eventItem.taskId, previousDuration, duration);
        }
      }
      // The timeline already reflects the new range optimistically. Release the
      // interaction lock as soon as Google accepts the write; the read sync can
      // finish in the background without preventing another drag.
      setIsSaving(false);
      window.dispatchEvent(new Event("heavyuser:schedule-refresh"));
      void loadConnectionAndEvents(false);
    } catch (moveError) {
      const eventKey = getLiveEventKey(eventItem);
      const pending = pendingEventRanges.current.get(eventKey);
      if (pending?.start === start && pending.end === end) {
        pendingEventRanges.current.delete(eventKey);
        const timer = pendingEventRangeTimers.current.get(eventKey);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          pendingEventRangeTimers.current.delete(eventKey);
        }
      }
      setError(moveError instanceof Error ? moveError.message : "The event could not be moved.");
      void loadConnectionAndEvents(false);
    } finally {
      setIsSaving(false);
    }
  }

  function saveDraggedEvent(eventItem: LiveEvent, start: string, end: string, mode: EventGestureMode) {
    // Keep direct-manipulation writes in order. This prevents two quick drags
    // from racing Google Calendar's If-Match check while keeping the UI free.
    const operation = dragWriteChain.current.then(() => {
      const latestEvent = eventsRef.current.find((currentEvent) => getLiveEventKey(currentEvent) === getLiveEventKey(eventItem)) ?? eventItem;
      return performDraggedEventSave(latestEvent, start, end, mode);
    });
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
      setDragPreview({ eventId: getLiveEventKey(gesture.event), ...getGestureRange(gesture, event.clientY) });
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
        const eventKey = getLiveEventKey(gesture.event);
        const previousTimer = pendingEventRangeTimers.current.get(eventKey);
        if (previousTimer !== undefined) {
          window.clearTimeout(previousTimer);
        }
        pendingEventRanges.current.set(eventKey, {
          start: finalRange.start,
          end: finalRange.end,
        });
        const timer = window.setTimeout(() => {
          const pending = pendingEventRanges.current.get(eventKey);
          if (pending?.start === finalRange.start && pending.end === finalRange.end) {
            pendingEventRanges.current.delete(eventKey);
            pendingEventRangeTimers.current.delete(eventKey);
          }
        }, 60_000);
        pendingEventRangeTimers.current.set(eventKey, timer);
        setEvents((currentEvents) => currentEvents.map((currentEvent) => (
          getLiveEventKey(currentEvent) === eventKey
            ? { ...currentEvent, start: finalRange.start, end: finalRange.end }
            : currentEvent
        )));
        setDragPreview(null);
        void saveDraggedEvent(gesture.event, finalRange.start, finalRange.end, gesture.mode);
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

  return (
    <section className="hu-region hu-calendar-region" aria-label="Planner">
      <div className="hu-calendar-toolbar">
        <div>
          <span className="hu-calendar-kicker">Planner</span>
          <strong>{formatDateLabel(selectedDate)}</strong>
        </div>
        <div className="hu-calendar-actions">
          {spaces.length > 0 ? (
            <label className="hu-calendar-space-filter">
              <span className="sr-only">Show Space</span>
              <select aria-label="Filter planner by Space" value={effectiveSpaceFilter} onChange={(event) => setSelectedSpaceFilter(event.target.value)}>
                <option value="all">All Spaces</option>
                {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
              </select>
            </label>
          ) : null}
          {isConnected ? (
            <>
            <span className="hu-calendar-connection" title={connection?.accountEmail ?? "Google Calendar connected"}>
                <span className="hu-calendar-connection-dot" aria-hidden="true" />
                {spaces.length > 1 ? `${spaces.length} Spaces` : connection?.calendarName ?? "Google Calendar"}
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

      <div
        className="hu-calendar-date-bar"
        title={settings.nightOwlMode ? `Night Owl day starts at ${formatStartTime(settings.dayStartTime)}.` : "Full calendar day."}
      >
        <div className="hu-calendar-date-nav" aria-label="Planner dates">
          <button
            aria-label="Previous day"
            className="hu-calendar-date-arrow"
            disabled={selectedDateIndex === 0}
            type="button"
            onClick={() => scrollToPlannerDay(plannerDates[selectedDateIndex - 1])}
          >
            <ChevronLeft aria-hidden="true" size={15} />
          </button>
          <div className="hu-calendar-date-strip">
            {plannerDates.map((plannerDate) => (
              <button
                aria-pressed={selectedDate === plannerDate}
                className={`hu-calendar-day-button ${selectedDate === plannerDate ? "is-active" : ""}`}
                key={plannerDate}
                type="button"
                onClick={() => scrollToPlannerDay(plannerDate)}
              >
                <span className="hu-calendar-day-label">{formatDayButtonLabel(plannerDate, date)}</span>
                <span className="hu-calendar-day-number">{new Date(`${plannerDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </button>
            ))}
          </div>
          <button
            aria-label="Next day"
            className="hu-calendar-date-arrow"
            disabled={selectedDateIndex === plannerDates.length - 1}
            type="button"
            onClick={() => scrollToPlannerDay(plannerDates[selectedDateIndex + 1])}
          >
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
        <button
          aria-label={isTimelineAwayFromNow ? "Jump to current time" : "Center current time"}
          className={`hu-calendar-now-button ${isTimelineAwayFromNow ? "is-away" : "is-current"}`}
          title={isTimelineAwayFromNow ? "Jump back to the current time" : "You are viewing the current time"}
          type="button"
          onClick={jumpToNow}
        >
          <Clock3 aria-hidden="true" size={13} />
          Now
        </button>
      </div>

      {error || schedulerError ? <div className="hu-calendar-alert" role="alert">{error || schedulerError}</div> : null}

      {!isConnected && !isLoading ? (
        <div className="hu-calendar-empty">
          <CalendarDays aria-hidden="true" size={22} />
          <strong>See your day in HeavyUser</strong>
            <p>Connect a Google Calendar to bring your commitments into the planner.</p>
          <button className="hu-calendar-connect-button" type="button" onClick={() => { window.location.href = getAppPath("/api/google/calendar/connect"); }}>
            Connect Google Calendar
          </button>
        </div>
      ) : null}

      {isConnected ? <div className="hu-calendar-body">
        <div className="hu-timeline">
          <div
            className="hu-timeline-scroll"
            ref={timelineScrollRef}
            onPointerCancel={handleTimelinePointerCancel}
            onPointerDown={handleTimelinePointerDown}
            onPointerUp={handleTimelinePointerUp}
            onTouchCancel={handleTimelineTouchCancel}
            onTouchEnd={handleTimelineTouchEnd}
            onTouchStart={handleTimelineTouchStart}
            onScroll={(event) => handleTimelineScroll(event.currentTarget)}
          >
            {plannerTimelineDays.map((day, dayIndex) => {
              const midnightTimestamp = getTimestampForLocalDateTime(addCalendarDays(day.date, 1), 0, timeZone);
              const midnightPosition = getTimelineMarkerPosition(midnightTimestamp, day.timelineStartTimestamp, day.timelineEndTimestamp);
              const isCurrentDay = day.date === date;
              const timeLabels = day.timeLabels;

              return (
                <section className="hu-calendar-day" data-date={day.date} key={day.date}>
                  <div
                    aria-label={`Planner day ${formatDateLabel(day.date)}${settings.nightOwlMode ? `, starts ${formatStartTime(settings.dayStartTime)}` : ""}`}
                    className="hu-calendar-day-heading"
                  >
                    <div className="hu-calendar-day-heading-copy">
                      <strong>{formatDateLabel(day.date)}</strong>
                      {settings.nightOwlMode ? <span className="hu-calendar-day-start">starts {formatStartTime(settings.dayStartTime)}</span> : null}
                    </div>
                    {day.allDayEvents.length > 0 ? (
                      <div className="hu-calendar-day-all-day" aria-label={`All-day events for ${day.date}`}>
                        <span>All day</span>
                        {day.allDayEvents.map((event) => (
                          <button className={`hu-all-day-event ${isCrossSpaceBusyEvent(event) ? "is-cross-space-busy" : ""}`} key={getLiveEventKey(event)} type="button" onClick={() => beginEdit(event)}>
                            {isCrossSpaceBusyEvent(event) ? "Busy · " : ""}{event.title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="hu-calendar-day-grid">
                    <div className="hu-time-labels" aria-hidden="true" style={{ "--hu-visible-hours": timelineHours, "--hu-hour-height": `${timelineHourHeight}px` } as CSSProperties}>
                      {timeLabels.map((label, index) => {
                        if (dayIndex > 0 && index === 0) {
                          return null;
                        }

                        return (
                          <span className="hu-time-label" key={`${day.date}-${label}-${index}`} style={{ top: `${(index / timelineHours) * 100}%` }}>
                            {label}
                          </span>
                        );
                      })}
                    </div>
                    <div className="hu-calendar-stage" role="group" aria-label={`Planner for ${day.date}`} style={{ "--hu-visible-hours": timelineHours, "--hu-hour-height": `${timelineHourHeight}px` } as CSSProperties}>
                      <span className={`hu-timeline-marker hu-timeline-marker-midnight ${midnightPosition === 0 ? "is-at-start" : ""}`} style={{ top: `${midnightPosition}%` }}>
                        <span>12 AM</span>
                      </span>
                      {settings.nightOwlMode ? (
                        <span aria-hidden="true" className="hu-timeline-marker hu-timeline-marker-night-owl is-at-start" style={{ top: "0%" }} />
                      ) : null}
                      {isCurrentDay && nowTimestamp >= day.timelineStartTimestamp && nowTimestamp <= day.timelineEndTimestamp ? (
                        <span className="hu-now-line" style={{ top: `${getTimelineMarkerPosition(nowTimestamp, day.timelineStartTimestamp, day.timelineEndTimestamp)}%` }}>
                          <span className="hu-now-label">{currentTimeLabel}</span>
                        </span>
                      ) : null}

                      {day.timedEvents.map((event) => {
                        const eventKey = getLiveEventKey(event);
                        const renderedEvent = dragPreview?.eventId === eventKey
                          ? { ...event, start: dragPreview.start, end: dragPreview.end }
                          : event;
                        const range = getEventRange(renderedEvent, day.timelineStartTimestamp, day.timelineEndTimestamp);
                        if (!range) return null;
                        const visibleMinutes = range.end - range.start;
                        const eventHeight = (visibleMinutes / 60) * timelineHourHeight;
                        const eventIsCompact = eventHeight < 72;
                        const eventHidesMeta = eventHeight < 38;
                        const eventHidesTitle = eventHeight < 24;
                        const eventIsTiny = eventHeight < 18;
                        const eventTimeLabel = formatEventTime(renderedEvent, renderedEvent.timeZone ?? timeZone);
                        const eventStatusLabel = event.isActiveTimerBlock ? "Working now" : event.isTaskBlock ? "Planned" : null;
                        const crossSpaceBusy = isCrossSpaceBusyEvent(event);
                        return (
                          <button
                            aria-label={`${event.title}. ${eventStatusLabel ? `${eventStatusLabel}. ` : ""}${eventTimeLabel}`}
                            className={`hu-event hu-event-button ${event.hasAttendees ? "is-guest-event" : ""} ${event.isTaskBlock ? "is-task-block" : ""} ${event.isActiveTimerBlock ? "is-active-timer" : ""} ${event.isPlannerSynthetic ? "is-planner-synthetic" : ""} ${crossSpaceBusy ? "is-cross-space-busy" : ""} ${eventIsCompact ? "is-compact" : ""} ${eventIsTiny ? "is-tiny" : ""} ${eventGesture && getLiveEventKey(eventGesture.event) === eventKey ? "is-gesture-active" : ""}`}
                            key={eventKey}
                            style={{
                              top: `${(range.start / (timelineHours * 60)) * 100}%`,
                              height: `${((range.end - range.start) / (timelineHours * 60)) * 100}%`,
                            }}
                            title={`${event.title} · ${eventStatusLabel ? `${eventStatusLabel} · ` : ""}${eventTimeLabel}`}
                            type="button"
                            onPointerDown={event.isPlannerSynthetic || isReadOnlyEvent(event) ? undefined : (pointerEvent) => startEventGesture(pointerEvent, event, "move")}
                            onClick={event.isPlannerSynthetic ? undefined : () => handleEventClick(event)}
                          >
                            {!event.isPlannerSynthetic && !isReadOnlyEvent(event) ? (
                              <span
                                aria-hidden="true"
                                className="hu-event-resize-handle hu-event-resize-handle-start"
                                onPointerDown={(pointerEvent) => {
                                  pointerEvent.stopPropagation();
                                  startEventGesture(pointerEvent, event, "resize-start");
                                }}
                              />
                            ) : null}
                            <span className="hu-event-heading">
                              {!eventHidesTitle ? <span className="hu-event-title">{event.title}</span> : null}
                              {!eventHidesMeta && (event.isTaskBlock || event.spaceName || crossSpaceBusy) ? <span className="hu-event-space-label">{crossSpaceBusy ? `Busy · ${event.spaceName ?? "Other Space"}` : event.subSpaceName ?? event.spaceName}</span> : null}
                              {event.meetingUrl ? (
                                <span aria-label="Video meeting available" className="hu-event-meeting" title="Video meeting available">
                                  <Video aria-hidden="true" size={12} />
                                </span>
                              ) : null}
                            </span>
                            {!eventHidesMeta ? (
                              <span className="hu-event-meta">
                                {eventStatusLabel ? <span className={`hu-event-status ${event.isActiveTimerBlock ? "is-active" : ""}`}>{eventStatusLabel}</span> : null}
                                {eventStatusLabel ? " · " : null}
                                {eventTimeLabel}
                              </span>
                            ) : null}
                            {!event.isPlannerSynthetic && !isReadOnlyEvent(event) ? (
                              <span
                                aria-hidden="true"
                                className="hu-event-resize-handle hu-event-resize-handle-end"
                                onPointerDown={(pointerEvent) => {
                                  pointerEvent.stopPropagation();
                                  startEventGesture(pointerEvent, event, "resize-end");
                                }}
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div> : null}

      {isCalendarPickerOpen ? (
        <div className="hu-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCalendarPickerOpen(false); }}>
          <div aria-labelledby="google-calendar-picker-title" className="hu-calendar-picker" ref={(node) => { modalDialogRef.current = node; }} role="dialog" aria-modal="true" tabIndex={-1}>
            <button aria-label="Close calendar picker" className="hu-task-dialog-close hu-icon-button" type="button" onClick={() => setIsCalendarPickerOpen(false)}>
              <X aria-hidden="true" />
            </button>
            <span className="hu-calendar-kicker">Google Calendar</span>
            <h2 id="google-calendar-picker-title">Choose a calendar for this Space</h2>
            <p>This calendar becomes one Space. You can add more calendars as separate Spaces later.</p>
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
          <form aria-labelledby="google-event-dialog-title" className="hu-calendar-event-dialog" ref={(node) => { modalDialogRef.current = node; }} role="dialog" aria-modal="true" tabIndex={-1} onSubmit={handleSave}>
            <button aria-label="Close event editor" className="hu-task-dialog-close hu-icon-button" type="button" onClick={() => { setIsCreating(false); setEditingEvent(null); }}>
              <X aria-hidden="true" />
            </button>
            <span className="hu-calendar-kicker">Google Calendar</span>
            <h2 id="google-event-dialog-title">{isCreating ? "Add event" : "Event details"}</h2>
            {isCreating ? <div className="hu-calendar-readonly-note">This event will be saved to {spaces.find((space) => space.id === effectiveSpaceFilter)?.name ?? connection?.calendarName ?? "your selected calendar"}.</div> : null}
            {editingEvent?.isPlannerSynthetic ? <div className="hu-calendar-readonly-note">This scheduled block is still syncing. You can reschedule it now, but editing details will be available after it finishes syncing.</div> : null}
            {!editingEvent?.isPlannerSynthetic && editingEvent?.isTaskBlock ? <div className="hu-calendar-readonly-note">Moving or editing this task block locks it in place. Deleting it will reschedule the work.</div> : null}
            {editingEvent?.hasAttendees ? <div className="hu-calendar-readonly-note">This meeting has guests, so it is read-only in HeavyUser. Open it in Google Calendar to make changes.</div> : null}
            {editingEvent && isCrossSpaceBusyEvent(editingEvent) ? <div className="hu-calendar-readonly-note">This event belongs to another Space and is shown here only to protect the busy time.</div> : null}
            {editingEvent?.allDay ? <div className="hu-calendar-readonly-note">All-day event editing will be available in a later release.</div> : null}
            <label>Title<input disabled={Boolean(editingEvent?.allDay || editingEvent?.isPlannerSynthetic || (editingEvent && isReadOnlyEvent(editingEvent)))} required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <div className="hu-calendar-event-grid">
              <label>Start<input disabled={Boolean(editingEvent?.allDay || editingEvent?.isPlannerSynthetic || (editingEvent && isReadOnlyEvent(editingEvent)))} required type="datetime-local" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} /></label>
              <label>End<input disabled={Boolean(editingEvent?.allDay || editingEvent?.isPlannerSynthetic || (editingEvent && isReadOnlyEvent(editingEvent)))} required type="datetime-local" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} /></label>
            </div>
            <label>Duration (minutes)<input disabled={Boolean(editingEvent?.allDay || editingEvent?.isPlannerSynthetic || (editingEvent && isReadOnlyEvent(editingEvent)))} min="5" max="1440" step="5" type="number" value={getDraftDurationMinutes(draft.start, draft.end, draftTimeZone) ?? ""} onChange={(event) => {
              const minutes = Number(event.target.value);
              if (Number.isFinite(minutes) && minutes > 0) {
                setDraft((current) => ({ ...current, end: addMinutesToDateTimeInput(current.start, minutes, draftTimeZone) }));
              }
            }} /></label>
            <label>Location<input disabled={Boolean(editingEvent?.allDay || editingEvent?.isPlannerSynthetic || (editingEvent && isReadOnlyEvent(editingEvent)))} value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} /></label>
            {editingEvent?.meetingUrl ? (
              <a className="hu-calendar-meeting-link" href={editingEvent.meetingUrl} rel="noreferrer" target="_blank">
                <Video aria-hidden="true" size={14} />
                Open video meeting
                <ExternalLink aria-hidden="true" size={12} />
              </a>
            ) : null}
            <label>Notes<textarea disabled={Boolean(editingEvent?.allDay || editingEvent?.isPlannerSynthetic || (editingEvent && isReadOnlyEvent(editingEvent)))} rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <div className="hu-calendar-dialog-actions">
              {editingEvent?.htmlLink ? <a className="hu-calendar-open-link" href={editingEvent.htmlLink} rel="noreferrer" target="_blank"><ExternalLink aria-hidden="true" size={13} />Open in Google</a> : <span />}
              {!editingEvent?.hasAttendees && !editingEvent?.allDay && editingEvent ? <button className="hu-calendar-delete-button" disabled={isSaving} type="button" onClick={() => void handleDelete()}><Trash2 aria-hidden="true" size={13} />{editingEvent.isTaskBlock ? "Reschedule" : "Delete"}</button> : null}
              {editingEvent?.allDay || editingEvent?.isPlannerSynthetic || (editingEvent && isReadOnlyEvent(editingEvent)) ? <button className="hu-calendar-add-button" type="button" onClick={() => { setIsCreating(false); setEditingEvent(null); }}>Close</button> : <button className="hu-calendar-add-button" disabled={isSaving} type="submit"><Pencil aria-hidden="true" size={13} />{isSaving ? "Saving…" : "Save event"}</button>}
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
