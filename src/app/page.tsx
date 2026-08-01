"use client";

import {
  CSSProperties,
  Dispatch,
  DragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bell,
  CalendarRange,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Globe2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  TimerReset,
  Trash2,
  X,
  Zap,
} from "lucide-react";

type Task = {
  id: string;
  title: string;
  duration: number | null;
  deadline: string | null;
  priority: Priority;
  status: "open" | "focus" | "done";
};

type Priority = "urgent" | "high" | "normal" | "low";

type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type TimeWindow = {
  id: string;
  start: string;
  end: string;
};

type SettingsState = {
  timezone: string;
  autoDetectTimezone: boolean;
  weekStartsOn: "monday" | "sunday";
  timeFormat: "12h" | "24h";
  dateFormat: "mdy" | "dmy" | "ymd";
  workingDays: Record<Weekday, boolean>;
  workingStart: string;
  workingEnd: string;
  workingWindows: TimeWindow[];
  personalHoursEnabled: boolean;
  personalDays: Record<Weekday, boolean>;
  personalStart: string;
  personalEnd: string;
  defaultDuration: number;
  defaultPriority: Priority;
  defaultSchedulingHours: "working" | "working-personal" | "any";
  minimumSession: number;
  maximumSession: number;
  splitLongTasks: boolean;
  autoSchedule: boolean;
  autoReschedule: boolean;
  schedulingHorizon: "7" | "14" | "30";
  addBreaks: boolean;
  breakLength: "5" | "10" | "15" | "30";
  scheduleBeforeDeadline: boolean;
  leaveOverdueUnscheduled: boolean;
  conflictHandling: "reschedule" | "keep" | "ask";
  pauseScheduling: boolean;
  connectedCalendarIds: string[];
  availabilityCalendars: string[];
  taskCalendar: string;
  includeAllDayEvents: boolean;
  includeTentativeEvents: boolean;
  includeDeclinedEvents: boolean;
  includeOutOfOfficeEvents: boolean;
  includePrivateEvents: boolean;
  dailyPlan: boolean;
  dailyPlanTime: string;
  upcomingTask: boolean;
  upcomingLeadTime: "5" | "10" | "15" | "30" | "60";
  overdueTask: boolean;
  schedulingProblem: boolean;
  rescheduledTask: boolean;
  notificationChannel: "in-app" | "browser" | "email";
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
};

type SettingsSection = {
  id: string;
  label: string;
  description: string;
};

const settingsStorageKey = "heavyuser:settings:v1";

const weekdayOptions = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] satisfies ReadonlyArray<{ value: Weekday; label: string }>;

const settingsSections: ReadonlyArray<SettingsSection> = [
  { id: "general", label: "General", description: "Locale and display" },
  { id: "hours", label: "Hours", description: "When work can move" },
  { id: "tasks", label: "Tasks", description: "Capture defaults" },
  { id: "scheduling", label: "Scheduling", description: "Automation rules" },
  { id: "calendars", label: "Calendars", description: "Availability sources" },
  { id: "notifications", label: "Notifications", description: "Useful nudges" },
];

const connectedCalendars = [
  { id: "work", name: "Work calendar", provider: "Google Calendar", color: "#3b82f6" },
  { id: "personal", name: "Personal", provider: "Apple Calendar", color: "#f97316" },
  { id: "team", name: "Team rituals", provider: "Google Calendar", color: "#8b5cf6" },
] as const;

const defaultSettings: SettingsState = {
  timezone: "Asia/Dhaka",
  autoDetectTimezone: false,
  weekStartsOn: "monday",
  timeFormat: "12h",
  dateFormat: "mdy",
  workingDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  workingStart: "09:00",
  workingEnd: "17:30",
  workingWindows: [
    { id: "work-1", start: "09:00", end: "12:30" },
    { id: "work-2", start: "13:30", end: "17:30" },
  ],
  personalHoursEnabled: true,
  personalDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  personalStart: "19:00",
  personalEnd: "22:00",
  defaultDuration: 30,
  defaultPriority: "normal",
  defaultSchedulingHours: "working",
  minimumSession: 25,
  maximumSession: 90,
  splitLongTasks: true,
  autoSchedule: true,
  autoReschedule: true,
  schedulingHorizon: "14",
  addBreaks: true,
  breakLength: "10",
  scheduleBeforeDeadline: true,
  leaveOverdueUnscheduled: true,
  conflictHandling: "reschedule",
  pauseScheduling: false,
  connectedCalendarIds: ["work", "personal", "team"],
  availabilityCalendars: ["work", "personal"],
  taskCalendar: "work",
  includeAllDayEvents: true,
  includeTentativeEvents: false,
  includeDeclinedEvents: false,
  includeOutOfOfficeEvents: true,
  includePrivateEvents: true,
  dailyPlan: true,
  dailyPlanTime: "08:00",
  upcomingTask: true,
  upcomingLeadTime: "15",
  overdueTask: true,
  schedulingProblem: true,
  rescheduledTask: true,
  notificationChannel: "in-app",
  quietHoursEnabled: true,
  quietStart: "22:00",
  quietEnd: "07:00",
};

const priorityOptions = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
] satisfies ReadonlyArray<{ value: Priority; label: string }>;

const priorityOrder: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

type CalendarEvent = {
  id: string;
  title: string;
  time: string;
  start: number;
  end: number;
  status: "neutral" | "active";
};

// Keep inbox tasks separate from the old Today surface while migrating any
// existing local rows so a navigation rename does not discard user data.
const storageKey = "heavyuser:inbox-tasks:v4";
const legacyStorageKeys = ["heavyuser:today-tasks:v3", "heavyuser:today-tasks:v2"] as const;

const initialTasks = [
  {
    id: "task-01",
    title: "Finish the onboarding flow copy",
    duration: 45,
    deadline: "2026-08-01",
    priority: "high",
    status: "focus",
  },
  {
    id: "task-02",
    title: "Review activation metrics from last week",
    duration: 30,
    deadline: "2026-08-03",
    priority: "high",
    status: "open",
  },
  {
    id: "task-03",
    title: "Prepare the design review agenda",
    duration: 25,
    deadline: null,
    priority: "normal",
    status: "open",
  },
  {
    id: "task-04",
    title: "Send the revised launch timeline",
    duration: 15,
    deadline: "2026-08-02",
    priority: "urgent",
    status: "open",
  },
  {
    id: "task-05",
    title: "Capture notes from the customer call",
    duration: 20,
    deadline: null,
    priority: "low",
    status: "done",
  },
  {
    id: "task-06",
    title: "Clear the three highest-priority replies",
    duration: 20,
    deadline: "2026-08-01",
    priority: "normal",
    status: "done",
  },
] satisfies ReadonlyArray<Task>;

const calendarEvents = [
  {
    id: "event-01",
    title: "Plan the day",
    time: "8:00 – 8:30 AM",
    start: 8,
    end: 8.5,
    status: "neutral",
  },
  {
    id: "event-02",
    title: "Deep work · onboarding flow",
    time: "9:00 – 11:00 AM",
    start: 9,
    end: 11,
    status: "active",
  },
  {
    id: "event-03",
    title: "Design review",
    time: "11:30 AM – 12:30 PM",
    start: 11.5,
    end: 12.5,
    status: "neutral",
  },
  {
    id: "event-04",
    title: "Lunch",
    time: "1:00 – 2:00 PM",
    start: 13,
    end: 14,
    status: "neutral",
  },
  {
    id: "event-05",
    title: "Write product brief",
    time: "2:30 – 4:00 PM",
    start: 14.5,
    end: 16,
    status: "neutral",
  },
  {
    id: "event-06",
    title: "Inbox zero",
    time: "4:30 – 5:30 PM",
    start: 16.5,
    end: 17.5,
    status: "neutral",
  },
] satisfies ReadonlyArray<CalendarEvent>;

const timelineStart = 9;
const timelineHours = 9;
const currentTime = 10 + 20 / 60;
const timelineEnd = timelineStart + timelineHours;

function formatHour(hour: number) {
  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";
  return `${String(displayHour).padStart(2, "0")}:00 ${period}`;
}

const timeLabels = Array.from({ length: timelineHours + 1 }, (_, index) => {
  const hour = timelineStart + index;
  return formatHour(hour);
});

function sortTasks(tasks: ReadonlyArray<Task>) {
  return [...tasks].sort((firstTask, secondTask) => {
    const firstDone = firstTask.status === "done" ? 1 : 0;
    const secondDone = secondTask.status === "done" ? 1 : 0;

    if (firstDone !== secondDone) {
      return firstDone - secondDone;
    }

    const firstDeadline = firstTask.deadline ?? "9999-12-31";
    const secondDeadline = secondTask.deadline ?? "9999-12-31";

    if (firstDeadline !== secondDeadline) {
      return firstDeadline.localeCompare(secondDeadline);
    }

    return priorityOrder[firstTask.priority] - priorityOrder[secondTask.priority];
  });
}

function isPriority(value: unknown): value is Priority {
  return value === "urgent" || value === "high" || value === "normal" || value === "low";
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Task>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    (typeof candidate.duration === "number" || candidate.duration === null) &&
    (typeof candidate.deadline === "string" || candidate.deadline === null) &&
    isPriority(candidate.priority) &&
    (candidate.status === "open" || candidate.status === "focus" || candidate.status === "done")
  );
}

function normalizeStoredTask(value: unknown): Task | null {
  if (isTask(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    title?: unknown;
    duration?: unknown;
    deadline?: unknown;
    priority?: unknown;
    status?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    (candidate.status !== "open" && candidate.status !== "focus" && candidate.status !== "done")
  ) {
    return null;
  }

  const duration =
    typeof candidate.duration === "number"
      ? candidate.duration
      : typeof candidate.duration === "string"
        ? parseDuration(candidate.duration)
        : null;

  return {
    id: candidate.id,
    title: candidate.title,
    duration,
    deadline: typeof candidate.deadline === "string" && candidate.deadline ? candidate.deadline : null,
    priority: isPriority(candidate.priority) ? candidate.priority : "normal",
    status: candidate.status,
  };
}

function formatDuration(duration: number | null) {
  if (duration === null) {
    return "No estimate";
  }

  if (duration < 60) {
    return `${duration} min`;
  }

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDeadline(deadline: string | null) {
  if (!deadline) {
    return "No deadline";
  }

  const today = getLocalDateString();
  const tomorrow = getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));

  if (deadline === today) {
    return "Today";
  }

  if (deadline === tomorrow) {
    return "Tomorrow";
  }

  const date = new Date(`${deadline}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "No deadline"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isDeadlineOverdue(deadline: string | null, status: Task["status"]) {
  return Boolean(deadline && status !== "done" && deadline < getLocalDateString());
}

function getPriorityLabel(priority: Priority) {
  return priorityOptions.find((option) => option.value === priority)?.label ?? "Normal";
}

function parseDuration(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ensureSingleFocus(tasks: ReadonlyArray<Task>) {
  const existingFocusIndex = tasks.findIndex((task) => task.status === "focus");
  const nextFocusIndex =
    existingFocusIndex >= 0 ? existingFocusIndex : tasks.findIndex((task) => task.status !== "done");

  return tasks.map((task, index): Task => {
    if (task.status === "focus" && index !== nextFocusIndex) {
      return { ...task, status: "open" };
    }

    if (index === nextFocusIndex && task.status !== "done") {
      return { ...task, status: "focus" };
    }

    return task;
  });
}

function normalizeSettings(value: unknown): SettingsState {
  if (!value || typeof value !== "object") {
    return defaultSettings;
  }

  const candidate = value as Partial<SettingsState>;
  const savedDays = candidate.workingDays;
  const workingDays = { ...defaultSettings.workingDays };
  const personalDays = { ...defaultSettings.personalDays };

  if (savedDays && typeof savedDays === "object") {
    for (const option of weekdayOptions) {
      if (typeof savedDays[option.value] === "boolean") {
        workingDays[option.value] = savedDays[option.value];
      }
    }
  }

  if (candidate.personalDays && typeof candidate.personalDays === "object") {
    for (const option of weekdayOptions) {
      if (typeof candidate.personalDays[option.value] === "boolean") {
        personalDays[option.value] = candidate.personalDays[option.value];
      }
    }
  }

  const savedWindows = Array.isArray(candidate.workingWindows)
    ? candidate.workingWindows.filter(
        (window): window is TimeWindow =>
          Boolean(
            window &&
              typeof window.id === "string" &&
              typeof window.start === "string" &&
              typeof window.end === "string",
          ),
      )
    : [];
  const legacyWindow =
    typeof candidate.workingStart === "string" && typeof candidate.workingEnd === "string"
      ? [{ id: "work-1", start: candidate.workingStart, end: candidate.workingEnd }]
      : [];
  const workingWindows = savedWindows.length > 0 ? savedWindows : legacyWindow.length > 0 ? legacyWindow : defaultSettings.workingWindows;
  const lastWorkingWindow = workingWindows[workingWindows.length - 1];

  return {
    ...defaultSettings,
    ...candidate,
    workingDays,
    personalDays,
    workingWindows,
    workingStart: workingWindows[0]?.start ?? defaultSettings.workingStart,
    workingEnd: lastWorkingWindow?.end ?? defaultSettings.workingEnd,
    connectedCalendarIds: Array.isArray(candidate.connectedCalendarIds)
      ? candidate.connectedCalendarIds.filter((calendarId): calendarId is string =>
          connectedCalendars.some((calendar) => calendar.id === calendarId),
        )
      : defaultSettings.connectedCalendarIds,
    availabilityCalendars: Array.isArray(candidate.availabilityCalendars)
      ? candidate.availabilityCalendars.filter((calendarId): calendarId is string =>
          connectedCalendars.some((calendar) => calendar.id === calendarId),
        )
      : defaultSettings.availabilityCalendars,
  };
}


export default function Home() {
  const [tasks, setTasks] = useState<ReadonlyArray<Task>>(initialTasks);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [isSettingsHydrated, setIsSettingsHydrated] = useState(false);
  const [isCustomOrder, setIsCustomOrder] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("normal");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDuration, setEditingDuration] = useState("");
  const [editingDeadline, setEditingDeadline] = useState("");
  const [editingPriority, setEditingPriority] = useState<Priority>("normal");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const restoreTasks = () => {
      if (isCancelled) {
        return;
      }

      try {
        const savedTasks = [storageKey, ...legacyStorageKeys]
          .map((key) => window.localStorage.getItem(key))
          .find((value) => value !== null);

        if (savedTasks) {
          const parsedTasks: unknown = JSON.parse(savedTasks);
          if (Array.isArray(parsedTasks)) {
            const normalizedTasks = parsedTasks.map(normalizeStoredTask);
            if (normalizedTasks.every((task): task is Task => task !== null)) {
              setTasks(ensureSingleFocus(normalizedTasks));
            }
          }
        }
      } catch {
        // Invalid local data should fall back to the deterministic starter list.
      } finally {
        setIsHydrated(true);
      }
    };

    const frameId = window.requestAnimationFrame(restoreTasks);
    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (isHydrated) {
      window.localStorage.setItem(storageKey, JSON.stringify(tasks));
    }
  }, [isHydrated, tasks]);

  useEffect(() => {
    let isCancelled = false;

    const restoreSettings = () => {
      if (isCancelled) {
        return;
      }

      try {
        const savedSettings = window.localStorage.getItem(settingsStorageKey);
        if (savedSettings) {
          setSettings(normalizeSettings(JSON.parse(savedSettings)));
        }
      } catch {
        // Invalid local data should fall back to the deterministic defaults.
      } finally {
        setIsSettingsHydrated(true);
      }
    };

    const frameId = window.requestAnimationFrame(restoreSettings);
    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (isSettingsHydrated) {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
    }
  }, [isSettingsHydrated, settings]);

  useEffect(() => {
    if (!isNotificationsOpen && !isProfileOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && topbarRef.current?.contains(event.target)) {
        return;
      }

      setIsNotificationsOpen(false);
      setIsProfileOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsNotificationsOpen(false);
      setIsProfileOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationsOpen, isProfileOpen]);

  function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTaskTitle.trim();

    if (!title) {
      return;
    }

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title,
      duration: parseDuration(newTaskDuration),
      deadline: newTaskDeadline || null,
      priority: newTaskPriority,
      status: "open",
    };

    setTasks((currentTasks) => {
      const nextTask = currentTasks.some((task) => task.status === "focus")
        ? newTask
        : { ...newTask, status: "focus" as const };
      return [nextTask, ...currentTasks];
    });
    setNewTaskTitle("");
    setNewTaskDuration("");
    setNewTaskDeadline("");
    setNewTaskPriority("normal");
    setIsAdding(false);
  }

  function handleToggleTask(taskId: string) {
    setTasks((currentTasks) => {
      const toggledTask = currentTasks.find((task) => task.id === taskId);
      if (!toggledTask) {
        return currentTasks;
      }

      const nextFocusId =
        toggledTask.status === "focus"
          ? currentTasks.find((task) => task.id !== taskId && task.status !== "done")?.id ?? null
          : currentTasks.find((task) => task.status === "focus")?.id ?? null;

      const updatedTasks: ReadonlyArray<Task> = currentTasks.map((task): Task => {
        if (task.id === taskId) {
          return { ...task, status: task.status === "done" ? "open" : "done" };
        }

        if (task.status === "focus") {
          return { ...task, status: task.id === nextFocusId ? "focus" : "open" };
        }

        return task.id === nextFocusId ? { ...task, status: "focus" } : task;
      });

      if (toggledTask.status !== "done") {
        const completedTask = updatedTasks.find((task) => task.id === taskId);
        const remainingTasks = updatedTasks.filter((task) => task.id !== taskId);
        return completedTask ? [...remainingTasks, completedTask] : updatedTasks;
      }

      return updatedTasks;
    });
  }

  function handleStartEditing(task: Task) {
    setEditingId(task.id);
    setEditingTitle(task.title);
    setEditingDuration(task.duration === null ? "" : String(task.duration));
    setEditingDeadline(task.deadline ?? "");
    setEditingPriority(task.priority);
    setIsAdding(false);
  }

  function handleCancelEditing() {
    setEditingId(null);
    setEditingTitle("");
    setEditingDuration("");
    setEditingDeadline("");
    setEditingPriority("normal");
  }

  function handleEditKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelEditing();
    }
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    const title = editingTitle.trim();

    if (!title) {
      return;
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title,
              duration: parseDuration(editingDuration),
              deadline: editingDeadline || null,
              priority: editingPriority,
            }
          : task,
      ),
    );
    handleCancelEditing();
  }

  function handleDeleteTask(taskId: string) {
    setTasks((currentTasks) => {
      const deletedTask = currentTasks.find((task) => task.id === taskId);
      const remainingTasks = currentTasks.filter((task) => task.id !== taskId);

      if (deletedTask?.status !== "focus") {
        return remainingTasks;
      }

      const nextFocusId = remainingTasks.find((task) => task.status !== "done")?.id ?? null;
      return remainingTasks.map((task) =>
        task.id === nextFocusId ? { ...task, status: "focus" } : task,
      );
    });
    if (editingId === taskId) {
      handleCancelEditing();
    }
  }

  function handleSelectTask(taskId: string) {
    setTasks((currentTasks) => {
      const selectedTask = currentTasks.find((task) => task.id === taskId);
      if (!selectedTask || selectedTask.status === "done") {
        return currentTasks;
      }

      return currentTasks.map((task) => {
        if (task.id === taskId) {
          return { ...task, status: "focus" };
        }

        return task.status === "focus" ? { ...task, status: "open" } : task;
      });
    });
  }

  function reorderTask(taskId: string, targetId: string) {
    if (taskId === targetId) {
      return;
    }

    setTasks((currentTasks) => {
      const visibleTasks = isCustomOrder ? [...currentTasks] : sortTasks(currentTasks);
      const currentIndex = visibleTasks.findIndex((task) => task.id === taskId);
      const targetIndex = visibleTasks.findIndex((task) => task.id === targetId);

      if (currentIndex < 0 || targetIndex < 0) {
        return currentTasks;
      }

      const reorderedTasks = [...visibleTasks];
      const [movedTask] = reorderedTasks.splice(currentIndex, 1);
      const nextTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
      reorderedTasks.splice(nextTargetIndex, 0, movedTask);
      return reorderedTasks;
    });
    setIsCustomOrder(true);
  }

  function handleTaskDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
    setDraggingId(taskId);
    setDragOverId(null);
  }

  function handleTaskDragOver(event: DragEvent<HTMLElement>, taskId: string) {
    event.preventDefault();
    if (draggingId !== taskId) {
      event.dataTransfer.dropEffect = "move";
      setDragOverId(taskId);
    }
  }

  function handleTaskDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingId;

    if (sourceId) {
      reorderTask(sourceId, targetId);
    }

    setDraggingId(null);
    setDragOverId(null);
  }

  function handleTaskDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
  }

  function handleTaskRowKeyDown(event: ReactKeyboardEvent<HTMLElement>, taskId: string) {
    if (event.key === "Enter" || event.key === " ") {
      if (event.target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      handleSelectTask(taskId);
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    setTasks((currentTasks) => {
      const visibleTasks = isCustomOrder ? [...currentTasks] : sortTasks(currentTasks);
      const currentIndex = visibleTasks.findIndex((task) => task.id === taskId);
      const nextIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1);

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= visibleTasks.length) {
        return currentTasks;
      }

      const reorderedTasks = [...visibleTasks];
      [reorderedTasks[currentIndex], reorderedTasks[nextIndex]] = [
        reorderedTasks[nextIndex],
        reorderedTasks[currentIndex],
      ];
      return reorderedTasks;
    });
    setIsCustomOrder(true);
  }

  const visibleTasks = isCustomOrder ? tasks : sortTasks(tasks);

  return (
    <main className={`hu-shell ${isSettingsOpen ? "is-settings" : ""}`}>
      <div className="hu-main">
        <header ref={topbarRef} className="hu-topbar" aria-label="Global navigation">
          <button
            aria-label="Open Inbox"
            className="hu-brand-button"
            type="button"
            onClick={() => {
              setIsSettingsOpen(false);
              setIsNotificationsOpen(false);
              setIsProfileOpen(false);
            }}
          >
            <span className="hu-brand-name">heavyuser</span>
            <span className="hu-brand-context">{isSettingsOpen ? "Settings" : "Inbox"}</span>
          </button>

          <div className="hu-topbar-actions">
            <div className="hu-popover-anchor">
              <button
                aria-expanded={isNotificationsOpen}
                aria-label="Notifications"
                className="hu-topbar-button"
                type="button"
                onClick={() => {
                  setIsNotificationsOpen((current) => !current);
                  setIsProfileOpen(false);
                }}
                title="Notifications"
              >
                <Bell aria-hidden="true" size={17} />
                <span className="hu-notification-dot" aria-hidden="true" />
              </button>
              {isNotificationsOpen ? (
                <div className="hu-popover hu-notifications-popover" role="status">
                  <strong>Notifications</strong>
                  <span>You&apos;re all caught up.</span>
                </div>
              ) : null}
            </div>

            <div className="hu-popover-anchor">
              <button
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
                className="hu-profile-button"
                type="button"
                onClick={() => {
                  setIsProfileOpen((current) => !current);
                  setIsNotificationsOpen(false);
                }}
              >
                <span className="hu-avatar" aria-hidden="true">
                  K
                </span>
                <span className="hu-profile-copy">
                  <span className="hu-profile-name">Kowshik</span>
                  <span className="hu-profile-workspace">Personal workspace</span>
                </span>
                <ChevronDown aria-hidden="true" size={14} />
              </button>
              {isProfileOpen ? (
                <div className="hu-popover hu-profile-popover" role="menu" aria-label="Profile menu">
                  <div className="hu-popover-profile" role="presentation">
                    <strong>Kowshik</strong>
                    <span>Personal workspace</span>
                  </div>
                  <div className="hu-popover-divider" role="presentation" />
                  <button
                    aria-current={isSettingsOpen ? "page" : undefined}
                    className={`hu-menu-item ${isSettingsOpen ? "is-active" : ""}`}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setIsNotificationsOpen(false);
                      setIsProfileOpen(false);
                    }}
                  >
                    <Settings aria-hidden="true" size={14} />
                    <span>Settings</span>
                    {isSettingsOpen ? <Check aria-hidden="true" size={14} /> : null}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="hu-content">
          {isSettingsOpen ? (
            <SettingsView settings={settings} setSettings={setSettings} />
          ) : (
            <div className="hu-workspace">
            <section className="hu-region hu-task-region" aria-labelledby="inbox-title">
              <div className="hu-pane-toolbar">
                <div className="hu-pane-heading">
                  <h1 className="hu-pane-title" id="inbox-title">
                    Inbox
                  </h1>
                </div>
                <button
                  className="hu-add-button"
                  type="button"
                  onClick={() => {
                    setIsAdding((current) => !current);
                    setEditingId(null);
                  }}
                >
                  <Plus aria-hidden="true" size={15} />
                  {isAdding ? "Close" : "Add task"}
                </button>
              </div>

              {isAdding ? (
                <form className="hu-task-composer" onSubmit={handleAddTask}>
                  <div className="hu-composer-main-field">
                    <label className="hu-field-label" htmlFor="new-task-title">
                      Task
                    </label>
                    <input
                      autoFocus
                      className="hu-task-input"
                      id="new-task-title"
                      minLength={1}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      placeholder="What needs doing?"
                      required
                      value={newTaskTitle}
                    />
                  </div>
                  <div className="hu-task-options">
                    <label className="hu-field">
                      <span className="hu-field-label">Duration</span>
                      <span className="hu-duration-input-wrap">
                        <input
                          aria-label="Task duration in minutes"
                          className="hu-task-input hu-duration-input"
                          inputMode="numeric"
                          min="5"
                          onChange={(event) => setNewTaskDuration(event.target.value)}
                          placeholder="30"
                          step="5"
                          type="number"
                          value={newTaskDuration}
                        />
                        <span aria-hidden="true">min</span>
                      </span>
                    </label>
                    <label className="hu-field">
                      <span className="hu-field-label">Deadline</span>
                      <input
                        aria-label="Task deadline"
                        className="hu-task-input"
                        onChange={(event) => setNewTaskDeadline(event.target.value)}
                        type="date"
                        value={newTaskDeadline}
                      />
                    </label>
                    <label className="hu-field">
                      <span className="hu-field-label">Priority</span>
                      <select
                        aria-label="Task priority"
                        className={`hu-task-input hu-priority-select is-${newTaskPriority}`}
                        onChange={(event) => setNewTaskPriority(event.target.value as Priority)}
                        value={newTaskPriority}
                      >
                        {priorityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="hu-form-actions">
                    <button className="hu-form-button is-primary" type="submit">
                      Add task
                    </button>
                    <button
                      className="hu-form-button"
                      type="button"
                      onClick={() => {
                        setIsAdding(false);
                        setNewTaskTitle("");
                        setNewTaskDuration("");
                        setNewTaskDeadline("");
                        setNewTaskPriority("normal");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="hu-task-list">
                {visibleTasks.length === 0 ? (
                  <div className="hu-empty-state">
                    <p>No tasks in inbox.</p>
                    <button className="hu-empty-action" type="button" onClick={() => setIsAdding(true)}>
                      <Plus aria-hidden="true" size={14} />
                      Add task
                    </button>
                  </div>
                ) : (
                  visibleTasks.map((task) => {
                    const isDone = task.status === "done";
                    const isFocus = task.status === "focus";
                    const isEditing = editingId === task.id;
                    const hasDuration = task.duration !== null;
                    const hasDeadline = task.deadline !== null;

                    return (
                      <article
                        aria-label={task.title}
                        className={`hu-task-row ${isFocus ? "is-focus" : ""} ${
                          isDone ? "is-done-row" : ""
                        } ${draggingId === task.id ? "is-dragging" : ""} ${
                          dragOverId === task.id ? "is-drag-over" : ""
                        }`}
                        draggable={!isEditing}
                        aria-current={isFocus ? "true" : undefined}
                        key={task.id}
                        tabIndex={isEditing ? -1 : 0}
                        onClick={(event) => {
                          if (
                            event.target instanceof Element &&
                            event.target.closest("button, input, select, textarea")
                          ) {
                            return;
                          }

                          handleSelectTask(task.id);
                        }}
                        onKeyDown={(event) => handleTaskRowKeyDown(event, task.id)}
                        onDragEnd={handleTaskDragEnd}
                        onDragOver={(event) => handleTaskDragOver(event, task.id)}
                        onDragStart={(event) => handleTaskDragStart(event, task.id)}
                        onDrop={(event) => handleTaskDrop(event, task.id)}
                      >
                        <button
                          aria-label={`${isDone ? "Mark" : "Complete"} ${task.title}`}
                          className={`hu-check ${isDone ? "is-done" : ""}`}
                          type="button"
                          onClick={() => handleToggleTask(task.id)}
                        >
                          {isDone ? <Check aria-hidden="true" /> : null}
                        </button>

                        {isEditing ? (
                          <form
                            className="hu-inline-edit"
                            onSubmit={(event) => handleSaveEdit(event, task.id)}
                          >
                            <label className="hu-edit-field hu-edit-title-field">
                              <span className="hu-field-label">Task</span>
                              <input
                                autoFocus
                                className="hu-edit-input"
                                id={`edit-task-${task.id}`}
                                minLength={1}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                onKeyDown={handleEditKeyDown}
                                placeholder="Task title"
                                required
                                value={editingTitle}
                              />
                            </label>
                            <label className="hu-edit-field">
                              <span className="hu-field-label">Duration</span>
                              <span className="hu-duration-input-wrap">
                                <input
                                  aria-label="Task duration in minutes"
                                  className="hu-edit-input hu-duration-input"
                                  id={`edit-duration-${task.id}`}
                                  inputMode="numeric"
                                  min="5"
                                  onChange={(event) => setEditingDuration(event.target.value)}
                                  placeholder="30"
                                  step="5"
                                  type="number"
                                  value={editingDuration}
                                />
                                <span aria-hidden="true">min</span>
                              </span>
                            </label>
                            <label className="hu-edit-field">
                              <span className="hu-field-label">Deadline</span>
                              <input
                                aria-label="Task deadline"
                                className="hu-edit-input"
                                id={`edit-deadline-${task.id}`}
                                onChange={(event) => setEditingDeadline(event.target.value)}
                                type="date"
                                value={editingDeadline}
                              />
                            </label>
                            <label className="hu-edit-field">
                              <span className="hu-field-label">Priority</span>
                              <select
                                aria-label="Task priority"
                                className={`hu-edit-input hu-priority-select is-${editingPriority}`}
                                onChange={(event) => setEditingPriority(event.target.value as Priority)}
                                value={editingPriority}
                              >
                                {priorityOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              aria-label="Save task"
                              className="hu-icon-button is-primary"
                              type="submit"
                              title="Save task"
                            >
                              <Check aria-hidden="true" />
                            </button>
                            <button
                              aria-label="Cancel editing"
                              className="hu-icon-button"
                              type="button"
                              onClick={handleCancelEditing}
                              title="Cancel editing"
                            >
                              <X aria-hidden="true" />
                            </button>
                          </form>
                        ) : (
                          <>
                            <div className="hu-task-title-cell">
                              <span className="hu-task-title">{task.title}</span>
                            </div>

                            <span
                              aria-label={hasDuration ? `Duration: ${formatDuration(task.duration)}` : "No duration"}
                              className="hu-task-time"
                              title={hasDuration ? `Duration: ${formatDuration(task.duration)}` : undefined}
                            >
                              {hasDuration ? (
                                <>
                                  <Clock3 aria-hidden="true" size={11} />
                                  {formatDuration(task.duration)}
                                </>
                              ) : null}
                            </span>

                            <span
                              aria-label={hasDeadline ? `Deadline: ${formatDeadline(task.deadline)}` : "No deadline"}
                              className={`hu-task-deadline ${
                                isDeadlineOverdue(task.deadline, task.status) ? "is-overdue" : ""
                              }`}
                              title={hasDeadline ? `Deadline: ${task.deadline}` : undefined}
                            >
                              {hasDeadline ? (
                                <>
                                  <CalendarDays aria-hidden="true" size={11} />
                                  {formatDeadline(task.deadline)}
                                </>
                              ) : null}
                            </span>

                            <span
                              className={`hu-task-priority is-${task.priority}`}
                              title={`Priority: ${getPriorityLabel(task.priority)}`}
                            >
                              <span className="hu-priority-dot" aria-hidden="true" />
                              <span>{getPriorityLabel(task.priority)}</span>
                            </span>

                            <div className="hu-task-controls">
                              <button
                                aria-label={`Edit ${task.title}`}
                                className="hu-icon-button"
                                type="button"
                                onClick={() => handleStartEditing(task)}
                                title="Edit task"
                              >
                                <Pencil aria-hidden="true" />
                              </button>
                              <button
                                aria-label={`Delete ${task.title}`}
                                className="hu-icon-button is-danger"
                                type="button"
                                onClick={() => handleDeleteTask(task.id)}
                                title="Delete task"
                              >
                                <Trash2 aria-hidden="true" />
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <section className="hu-region hu-calendar-region" aria-labelledby="calendar-title">
              <div className="hu-pane-toolbar hu-calendar-toolbar">
                <div className="hu-pane-heading">
                  <h2 className="hu-pane-title" id="calendar-title">
                    Schedule
                  </h2>
                </div>
                <span className="hu-today-mark">Today</span>
              </div>

              <div className="hu-calendar-body">
                <div className="hu-timeline">
                  <div className="hu-time-labels" aria-hidden="true">
                    {timeLabels.map((label, index) => (
                      <span
                        className="hu-time-label"
                        key={label}
                        style={{ top: `${(index / timelineHours) * 100}%` }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  <div
                    className="hu-calendar-stage"
                    role="list"
                    aria-label="Schedule for August 1"
                    style={{ "--hu-visible-hours": timelineHours } as CSSProperties}
                  >
                    <span
                      className="hu-now-line"
                      style={{ top: `${((currentTime - timelineStart) / timelineHours) * 100}%` }}
                    >
                      <span className="hu-now-label">10:20 AM</span>
                    </span>

                    {calendarEvents
                      .filter((event) => event.end > timelineStart && event.start < timelineEnd)
                      .map((event) => (
                      <div
                        className={`hu-event ${event.status === "active" ? "is-active" : ""}`}
                        key={event.id}
                        role="listitem"
                        style={{
                          top: `${Math.max(((event.start - timelineStart) / timelineHours) * 100, 0)}%`,
                          height: `${Math.min(((event.end - event.start) / timelineHours) * 100, 100)}%`,
                        }}
                      >
                        <div className="hu-event-title">{event.title}</div>
                        <div className="hu-event-meta">{event.time}</div>
                      </div>
                      ))}
                  </div>
                </div>

              </div>
            </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function SettingsView({
  settings,
  setSettings,
}: {
  settings: SettingsState;
  setSettings: Dispatch<SetStateAction<SettingsState>>;
}) {
  const [activeSection, setActiveSection] = useState("general");
  const [settingsNotice, setSettingsNotice] = useState("Saved automatically");

  function updateSetting<Key extends keyof SettingsState>(key: Key, value: SettingsState[Key]) {
    setSettings((currentSettings) => ({ ...currentSettings, [key]: value }));
  }

  function resetSettings() {
    setSettings({
      ...defaultSettings,
      workingDays: { ...defaultSettings.workingDays },
      personalDays: { ...defaultSettings.personalDays },
      workingWindows: defaultSettings.workingWindows.map((window) => ({ ...window })),
      connectedCalendarIds: [...defaultSettings.connectedCalendarIds],
      availabilityCalendars: [...defaultSettings.availabilityCalendars],
    });
    setSettingsNotice("Defaults restored");
    window.setTimeout(() => setSettingsNotice("Saved automatically"), 1800);
  }

  function updateWorkingWindow(windowId: string, key: "start" | "end", value: string) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      workingWindows: currentSettings.workingWindows.map((window) =>
        window.id === windowId ? { ...window, [key]: value } : window,
      ),
      workingStart:
        key === "start" && currentSettings.workingWindows[0]?.id === windowId
          ? value
          : currentSettings.workingStart,
      workingEnd:
        key === "end" && currentSettings.workingWindows[currentSettings.workingWindows.length - 1]?.id === windowId
          ? value
          : currentSettings.workingEnd,
    }));
  }

  function addWorkingWindow() {
    setSettings((currentSettings) => ({
      ...currentSettings,
      workingWindows: [
        ...currentSettings.workingWindows,
        { id: `work-${Date.now()}`, start: "18:00", end: "19:00" },
      ],
    }));
  }

  function removeWorkingWindow(windowId: string) {
    setSettings((currentSettings) => {
      if (currentSettings.workingWindows.length === 1) {
        return currentSettings;
      }

      const workingWindows = currentSettings.workingWindows.filter((window) => window.id !== windowId);
      return {
        ...currentSettings,
        workingWindows,
        workingStart: workingWindows[0]?.start ?? currentSettings.workingStart,
        workingEnd: workingWindows[workingWindows.length - 1]?.end ?? currentSettings.workingEnd,
      };
    });
  }

  function toggleCalendar(calendarId: string) {
    setSettings((currentSettings) => {
      const isConnected = currentSettings.connectedCalendarIds.includes(calendarId);

      if (isConnected) {
        const connectedCalendarIds = currentSettings.connectedCalendarIds.filter((id) => id !== calendarId);
        const availabilityCalendars = currentSettings.availabilityCalendars.filter((id) => id !== calendarId);
        const taskCalendar =
          currentSettings.taskCalendar === calendarId
            ? connectedCalendarIds[0] ?? ""
            : currentSettings.taskCalendar;

        return { ...currentSettings, connectedCalendarIds, availabilityCalendars, taskCalendar };
      }

      return {
        ...currentSettings,
        connectedCalendarIds: [...currentSettings.connectedCalendarIds, calendarId],
      };
    });
  }

  function toggleAvailability(calendarId: string) {
    setSettings((currentSettings) => {
      if (!currentSettings.connectedCalendarIds.includes(calendarId)) {
        return currentSettings;
      }

      const isAvailable = currentSettings.availabilityCalendars.includes(calendarId);
      return {
        ...currentSettings,
        availabilityCalendars: isAvailable
          ? currentSettings.availabilityCalendars.filter((id) => id !== calendarId)
          : [...currentSettings.availabilityCalendars, calendarId],
      };
    });
  }

  const connectedCalendarOptions = connectedCalendars.filter((calendar) =>
    settings.connectedCalendarIds.includes(calendar.id),
  );

  return (
    <section className="hu-settings-page" aria-labelledby="settings-title">
      <div className="hu-settings-header">
        <div>
          <span className="hu-settings-eyebrow">Workspace preferences</span>
          <h1 className="hu-settings-title" id="settings-title">
            Settings
          </h1>
          <p className="hu-settings-intro">
            Set the hours, defaults, and guardrails HeavyUser uses to protect your attention.
          </p>
        </div>
        <div className="hu-settings-header-actions">
          <div className="hu-settings-save-state" aria-live="polite">
            <Check aria-hidden="true" size={13} />
            {settingsNotice}
          </div>
          <button className="hu-settings-reset-button" type="button" onClick={resetSettings}>
            <RotateCcw aria-hidden="true" size={13} />
            Reset settings
          </button>
        </div>
      </div>

      <div className="hu-settings-layout">
        <nav className="hu-settings-nav" aria-label="Settings sections">
          <span className="hu-settings-nav-label">On this page</span>
          {settingsSections.map((section) => (
            <a
              aria-current={activeSection === section.id ? "location" : undefined}
              className={`hu-settings-nav-link ${activeSection === section.id ? "is-active" : ""}`}
              href={`#settings-${section.id}`}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="hu-settings-nav-link-copy">
                <strong>{section.label}</strong>
                <span>{section.description}</span>
              </span>
            </a>
          ))}
        </nav>

        <div className="hu-settings-content">
          <SettingsCard
            id="settings-general"
            icon={<Globe2 aria-hidden="true" size={17} />}
            title="General"
            description="Use the formats that make your day easy to read."
          >
            <div className="hu-settings-field-grid">
              <SettingsField label="Time zone" hint="Used when placing tasks on your calendar.">
                <select
                  aria-label="Time zone"
                  className="hu-settings-select"
                  disabled={settings.autoDetectTimezone}
                  value={settings.timezone}
                  onChange={(event) => updateSetting("timezone", event.target.value)}
                >
                  <option value="Asia/Dhaka">Dhaka (UTC+06:00)</option>
                  <option value="Asia/Kolkata">Kolkata (UTC+05:30)</option>
                  <option value="Asia/Tokyo">Tokyo (UTC+09:00)</option>
                  <option value="Australia/Sydney">Sydney (UTC+10:00)</option>
                  <option value="America/Los_Angeles">Los Angeles (UTC−08:00)</option>
                  <option value="America/New_York">New York (UTC−05:00)</option>
                  <option value="America/Sao_Paulo">São Paulo (UTC−03:00)</option>
                  <option value="Europe/London">London (UTC+00:00)</option>
                  <option value="Europe/Berlin">Berlin (UTC+01:00)</option>
                  <option value="Africa/Cairo">Cairo (UTC+02:00)</option>
                  <option value="Asia/Singapore">Singapore (UTC+08:00)</option>
                </select>
              </SettingsField>
              <SettingsField label="Week starts on">
                <select
                  aria-label="Week starts on"
                  className="hu-settings-select"
                  value={settings.weekStartsOn}
                  onChange={(event) => updateSetting("weekStartsOn", event.target.value as SettingsState["weekStartsOn"])}
                >
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </SettingsField>
              <SettingsField label="Time format" hint="Used in task times and the daily schedule.">
                <select
                  aria-label="Time format"
                  className="hu-settings-select"
                  value={settings.timeFormat}
                  onChange={(event) => updateSetting("timeFormat", event.target.value as SettingsState["timeFormat"])}
                >
                  <option value="12h">12-hour · 9:00 AM</option>
                  <option value="24h">24-hour · 09:00</option>
                </select>
              </SettingsField>
              <SettingsField label="Date format" hint="Used for deadlines and calendar dates.">
                <select
                  aria-label="Date format"
                  className="hu-settings-select"
                  value={settings.dateFormat}
                  onChange={(event) => updateSetting("dateFormat", event.target.value as SettingsState["dateFormat"])}
                >
                  <option value="mdy">Aug 1, 2026</option>
                  <option value="dmy">1 Aug 2026</option>
                  <option value="ymd">2026-08-01</option>
                </select>
              </SettingsField>
            </div>
            <SettingsToggle
              checked={settings.autoDetectTimezone}
              description="Keep this workspace aligned with the device timezone when you travel."
              label="Use device timezone"
              onChange={(checked) => updateSetting("autoDetectTimezone", checked)}
            />
          </SettingsCard>

          <SettingsCard
            id="settings-hours"
            icon={<CalendarRange aria-hidden="true" size={17} />}
            title="Hours"
            description="Tell HeavyUser when it can place focused work."
          >
            <div className="hu-settings-subsection">
              <div className="hu-settings-subsection-heading">
                <div>
                  <h3>Working hours</h3>
                  <p>Tasks are scheduled inside these windows.</p>
                </div>
                <span className="hu-settings-inline-status">{settings.workingStart} – {settings.workingEnd}</span>
              </div>
              <div className="hu-settings-day-picker" aria-label="Working days">
                {weekdayOptions.map((day) => (
                  <label className="hu-settings-day" key={day.value}>
                    <input
                      checked={settings.workingDays[day.value]}
                      type="checkbox"
                      onChange={(event) =>
                        setSettings((currentSettings) => ({
                          ...currentSettings,
                          workingDays: { ...currentSettings.workingDays, [day.value]: event.target.checked },
                        }))
                      }
                    />
                    <span>{day.label}</span>
                  </label>
                ))}
              </div>
              <div className="hu-settings-window-list">
                {settings.workingWindows.map((window, index) => (
                  <div className="hu-settings-window-row" key={window.id}>
                    <span className="hu-settings-window-label">Window {index + 1}</span>
                    <SettingsField label="Start">
                      <input
                        aria-label={`Working window ${index + 1} start`}
                        className="hu-settings-input"
                        type="time"
                        value={window.start}
                        onChange={(event) => updateWorkingWindow(window.id, "start", event.target.value)}
                      />
                    </SettingsField>
                    <span className="hu-settings-range-dash" aria-hidden="true">–</span>
                    <SettingsField label="End">
                      <input
                        aria-label={`Working window ${index + 1} end`}
                        className="hu-settings-input"
                        type="time"
                        value={window.end}
                        onChange={(event) => updateWorkingWindow(window.id, "end", event.target.value)}
                      />
                    </SettingsField>
                    <button
                      aria-label={`Remove working window ${index + 1}`}
                      className="hu-settings-remove-button"
                      disabled={settings.workingWindows.length === 1}
                      type="button"
                      onClick={() => removeWorkingWindow(window.id)}
                    >
                      <Trash2 aria-hidden="true" size={13} />
                    </button>
                  </div>
                ))}
                <button className="hu-settings-add-button" type="button" onClick={addWorkingWindow}>
                  <Plus aria-hidden="true" size={13} />
                  Add working window
                </button>
              </div>
            </div>

            <div className="hu-settings-subsection">
              <SettingsToggle
                checked={settings.personalHoursEnabled}
                description="Keep personal time out of task placement."
                label="Personal hours"
                onChange={(checked) => updateSetting("personalHoursEnabled", checked)}
              />
              {settings.personalHoursEnabled ? (
                <>
                  <div className="hu-settings-day-picker hu-settings-personal-days" aria-label="Personal days">
                    {weekdayOptions.map((day) => (
                      <label className="hu-settings-day" key={day.value}>
                        <input
                          checked={settings.personalDays[day.value]}
                          type="checkbox"
                          onChange={(event) =>
                            setSettings((currentSettings) => ({
                              ...currentSettings,
                              personalDays: {
                                ...currentSettings.personalDays,
                                [day.value]: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{day.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="hu-settings-time-range hu-settings-personal-range">
                  <SettingsField label="Start">
                    <input
                      aria-label="Personal hours start"
                      className="hu-settings-input"
                      type="time"
                      value={settings.personalStart}
                      onChange={(event) => updateSetting("personalStart", event.target.value)}
                    />
                  </SettingsField>
                  <span className="hu-settings-range-dash" aria-hidden="true">–</span>
                  <SettingsField label="End">
                    <input
                      aria-label="Personal hours end"
                      className="hu-settings-input"
                      type="time"
                      value={settings.personalEnd}
                      onChange={(event) => updateSetting("personalEnd", event.target.value)}
                    />
                  </SettingsField>
                  </div>
                </>
              ) : null}
            </div>
          </SettingsCard>

          <SettingsCard
            id="settings-tasks"
            icon={<TimerReset aria-hidden="true" size={17} />}
            title="Tasks"
            description="Make task capture quick while keeping sessions realistic."
          >
            <div className="hu-settings-field-grid hu-settings-task-grid">
              <SettingsField label="Default duration" hint="Applied when a new task has no estimate.">
                <div className="hu-settings-input-with-suffix">
                  <input
                    aria-label="Default task duration"
                    className="hu-settings-input"
                    min="5"
                    step="5"
                    type="number"
                    value={settings.defaultDuration}
                    onChange={(event) => updateSetting("defaultDuration", Number(event.target.value) || 5)}
                  />
                  <span>min</span>
                </div>
              </SettingsField>
              <SettingsField label="Default priority">
                <select
                  aria-label="Default task priority"
                  className="hu-settings-select"
                  value={settings.defaultPriority}
                  onChange={(event) => updateSetting("defaultPriority", event.target.value as Priority)}
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </SettingsField>
              <SettingsField label="Schedule inside" hint="The default window used for new tasks.">
                <select
                  aria-label="Default scheduling hours"
                  className="hu-settings-select"
                  value={settings.defaultSchedulingHours}
                  onChange={(event) => updateSetting("defaultSchedulingHours", event.target.value as SettingsState["defaultSchedulingHours"])}
                >
                  <option value="working">Working hours</option>
                  <option value="working-personal">Working + personal</option>
                  <option value="any">Any available time</option>
                </select>
              </SettingsField>
              <SettingsField label="Minimum session" hint="Never schedule a block shorter than this.">
                <div className="hu-settings-input-with-suffix">
                  <input
                    aria-label="Minimum session length"
                    className="hu-settings-input"
                    min="5"
                    step="5"
                    type="number"
                    value={settings.minimumSession}
                    onChange={(event) => updateSetting("minimumSession", Number(event.target.value) || 5)}
                  />
                  <span>min</span>
                </div>
              </SettingsField>
              <SettingsField label="Maximum session" hint="Longer tasks can be split into sessions.">
                <div className="hu-settings-input-with-suffix">
                  <input
                    aria-label="Maximum session length"
                    className="hu-settings-input"
                    min="5"
                    step="5"
                    type="number"
                    value={settings.maximumSession}
                    onChange={(event) => updateSetting("maximumSession", Number(event.target.value) || 5)}
                  />
                  <span>min</span>
                </div>
              </SettingsField>
            </div>
            <SettingsToggle
              checked={settings.splitLongTasks}
              description="Break tasks longer than the maximum session into smaller blocks."
              label="Split long tasks"
              onChange={(checked) => updateSetting("splitLongTasks", checked)}
            />
          </SettingsCard>

          <SettingsCard
            id="settings-scheduling"
            icon={<Zap aria-hidden="true" size={17} />}
            title="Scheduling"
            description="Choose how much of the calendar HeavyUser is allowed to move."
          >
            <div className="hu-settings-toggle-grid">
              <SettingsToggle
                checked={settings.autoSchedule}
                description="Place new tasks into the next useful opening."
                label="Auto-schedule tasks"
                onChange={(checked) => updateSetting("autoSchedule", checked)}
              />
              <SettingsToggle
                checked={settings.autoReschedule}
                description="Find a new slot when a task is left unfinished."
                label="Auto-reschedule unfinished tasks"
                onChange={(checked) => updateSetting("autoReschedule", checked)}
              />
              <SettingsToggle
                checked={settings.addBreaks}
                description="Leave breathing room between focused sessions."
                label="Protect breaks"
                onChange={(checked) => updateSetting("addBreaks", checked)}
              />
              <SettingsToggle
                checked={settings.scheduleBeforeDeadline}
                description="Aim to finish planned work before its deadline arrives."
                label="Schedule before deadlines"
                onChange={(checked) => updateSetting("scheduleBeforeDeadline", checked)}
              />
              <SettingsToggle
                checked={settings.leaveOverdueUnscheduled}
                description="Keep overdue work visible until you choose a new deadline."
                label="Leave overdue tasks unscheduled"
                onChange={(checked) => updateSetting("leaveOverdueUnscheduled", checked)}
              />
            </div>
            <div className="hu-settings-field-grid hu-settings-scheduling-controls">
              <SettingsField label="Scheduling horizon" hint="How far ahead HeavyUser can place work.">
                <select
                  aria-label="Scheduling horizon"
                  className="hu-settings-select"
                  value={settings.schedulingHorizon}
                  onChange={(event) => updateSetting("schedulingHorizon", event.target.value as SettingsState["schedulingHorizon"])}
                >
                  <option value="7">Next 7 days</option>
                  <option value="14">Next 14 days</option>
                  <option value="30">Next 30 days</option>
                </select>
              </SettingsField>
              <SettingsField label="Break length" hint="The default buffer between scheduled sessions.">
                <select
                  aria-label="Break length"
                  className="hu-settings-select"
                  disabled={!settings.addBreaks}
                  value={settings.breakLength}
                  onChange={(event) => updateSetting("breakLength", event.target.value as SettingsState["breakLength"])}
                >
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                </select>
              </SettingsField>
              <SettingsField label="When a conflict appears" hint="Choose how much automation should intervene.">
                <select
                  aria-label="Conflict handling"
                  className="hu-settings-select"
                  value={settings.conflictHandling}
                  onChange={(event) => updateSetting("conflictHandling", event.target.value as SettingsState["conflictHandling"])}
                >
                  <option value="reschedule">Reschedule automatically</option>
                  <option value="keep">Keep the current plan</option>
                  <option value="ask">Ask before moving work</option>
                </select>
              </SettingsField>
            </div>
            <div className="hu-settings-pause-row">
              <SettingsToggle
                checked={settings.pauseScheduling}
                description="Keep your existing plan, but stop automatic changes until you turn this back on."
                label="Pause automatic scheduling"
                onChange={(checked) => updateSetting("pauseScheduling", checked)}
                tone="warning"
              />
            </div>
          </SettingsCard>

          <SettingsCard
            id="settings-calendars"
            icon={<ShieldCheck aria-hidden="true" size={17} />}
            title="Calendars"
            description="Decide which calendars shape availability and where tasks land."
          >
            <div className="hu-settings-subsection">
              <div className="hu-settings-subsection-heading">
                <div>
                  <h3>Connected calendars</h3>
                  <p>Reconnect an account if its events stop appearing.</p>
                </div>
                <span className="hu-settings-inline-status">3 sources</span>
              </div>
              <div className="hu-calendar-list">
                {connectedCalendars.map((calendar) => {
                  const isConnected = settings.connectedCalendarIds.includes(calendar.id);
                  const isAvailable = settings.availabilityCalendars.includes(calendar.id);

                  return (
                    <div className={`hu-calendar-setting-row ${!isConnected ? "is-disconnected" : ""}`} key={calendar.id}>
                      <span className="hu-calendar-color" style={{ backgroundColor: calendar.color }} aria-hidden="true" />
                      <span className="hu-calendar-setting-copy">
                        <strong>{calendar.name}</strong>
                        <span>{calendar.provider}</span>
                      </span>
                      <span className="hu-calendar-connection-status">
                        {isConnected ? "Connected" : "Disconnected"}
                      </span>
                      <label className="hu-calendar-availability">
                        <input
                          checked={isAvailable}
                          disabled={!isConnected}
                          type="checkbox"
                          onChange={() => toggleAvailability(calendar.id)}
                        />
                        <span>Availability</span>
                      </label>
                      <button
                        className="hu-settings-text-button is-muted"
                        type="button"
                        onClick={() => toggleCalendar(calendar.id)}
                      >
                        {isConnected ? "Disconnect" : "Reconnect"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="hu-settings-field-grid hu-settings-calendar-controls">
              <SettingsField label="Task calendar" hint="New scheduled tasks are placed here.">
                <select
                  aria-label="Task calendar"
                  className="hu-settings-select"
                  value={settings.taskCalendar}
                  onChange={(event) => updateSetting("taskCalendar", event.target.value)}
                >
                  {connectedCalendarOptions.length === 0 ? <option value="">No connected calendars</option> : null}
                  {connectedCalendarOptions.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                  ))}
                </select>
              </SettingsField>
            </div>
            <div className="hu-settings-toggle-grid">
              <SettingsToggle
                checked={settings.includeAllDayEvents}
                description="Count all-day events as unavailable time."
                label="Include all-day events"
                onChange={(checked) => updateSetting("includeAllDayEvents", checked)}
              />
              <SettingsToggle
                checked={settings.includeTentativeEvents}
                description="Treat tentative invitations as time you may need to protect."
                label="Include tentative events"
                onChange={(checked) => updateSetting("includeTentativeEvents", checked)}
              />
              <SettingsToggle
                checked={settings.includeDeclinedEvents}
                description="Keep declined events in the availability calculation."
                label="Include declined events"
                onChange={(checked) => updateSetting("includeDeclinedEvents", checked)}
              />
              <SettingsToggle
                checked={settings.includeOutOfOfficeEvents}
                description="Protect time marked as out of office."
                label="Include out-of-office events"
                onChange={(checked) => updateSetting("includeOutOfOfficeEvents", checked)}
              />
              <SettingsToggle
                checked={settings.includePrivateEvents}
                description="Use private events as busy time without reading their details."
                label="Include private events"
                onChange={(checked) => updateSetting("includePrivateEvents", checked)}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            id="settings-notifications"
            icon={<RefreshCw aria-hidden="true" size={17} />}
            title="Notifications"
            description="Get the few nudges that help you act on the plan."
          >
            <div className="hu-settings-field-grid hu-settings-notification-controls">
              <SettingsField label="Notify me via" hint="Choose the default channel for HeavyUser reminders.">
                <select
                  aria-label="Notification channel"
                  className="hu-settings-select"
                  value={settings.notificationChannel}
                  onChange={(event) => updateSetting("notificationChannel", event.target.value as SettingsState["notificationChannel"])}
                >
                  <option value="in-app">In-app notifications</option>
                  <option value="browser">Browser notifications</option>
                  <option value="email">Email notifications</option>
                </select>
              </SettingsField>
            </div>
            <div className="hu-settings-notification-list">
              <div className="hu-settings-notification-row">
                <SettingsToggle
                  checked={settings.dailyPlan}
                  description="A short look at your day, before work begins."
                  label="Daily plan"
                  onChange={(checked) => updateSetting("dailyPlan", checked)}
                />
                <SettingsField label="At">
                  <input
                    aria-label="Daily plan time"
                    className="hu-settings-input hu-settings-notification-time"
                    disabled={!settings.dailyPlan}
                    type="time"
                    value={settings.dailyPlanTime}
                    onChange={(event) => updateSetting("dailyPlanTime", event.target.value)}
                  />
                </SettingsField>
              </div>
              <div className="hu-settings-notification-row">
                <SettingsToggle
                  checked={settings.upcomingTask}
                  description="A reminder before the next scheduled task."
                  label="Upcoming task"
                  onChange={(checked) => updateSetting("upcomingTask", checked)}
                />
                <SettingsField label="Lead time">
                  <select
                    aria-label="Upcoming task lead time"
                    className="hu-settings-select hu-settings-notification-time"
                    disabled={!settings.upcomingTask}
                    value={settings.upcomingLeadTime}
                    onChange={(event) => updateSetting("upcomingLeadTime", event.target.value as SettingsState["upcomingLeadTime"])}
                  >
                    <option value="5">5 min</option>
                    <option value="10">10 min</option>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                  </select>
                </SettingsField>
              </div>
              <SettingsToggle
                checked={settings.overdueTask}
                description="Let me know when a task is past its deadline."
                label="Overdue task"
                onChange={(checked) => updateSetting("overdueTask", checked)}
              />
              <SettingsToggle
                checked={settings.schedulingProblem}
                description="Flag conflicts or work that no longer fits."
                label="Scheduling problem"
                onChange={(checked) => updateSetting("schedulingProblem", checked)}
              />
              <SettingsToggle
                checked={settings.rescheduledTask}
                description="Let me know when HeavyUser moves a task to a new time."
                label="Task rescheduled"
                onChange={(checked) => updateSetting("rescheduledTask", checked)}
              />
              <SettingsToggle
                checked={settings.quietHoursEnabled}
                description="Do not send reminders during your protected quiet window."
                label="Quiet hours"
                onChange={(checked) => updateSetting("quietHoursEnabled", checked)}
              />
              {settings.quietHoursEnabled ? (
                <div className="hu-settings-time-range hu-settings-quiet-range">
                  <SettingsField label="Quiet from">
                    <input
                      aria-label="Quiet hours start"
                      className="hu-settings-input"
                      type="time"
                      value={settings.quietStart}
                      onChange={(event) => updateSetting("quietStart", event.target.value)}
                    />
                  </SettingsField>
                  <span className="hu-settings-range-dash" aria-hidden="true">–</span>
                  <SettingsField label="Quiet until">
                    <input
                      aria-label="Quiet hours end"
                      className="hu-settings-input"
                      type="time"
                      value={settings.quietEnd}
                      onChange={(event) => updateSetting("quietEnd", event.target.value)}
                    />
                  </SettingsField>
                </div>
              ) : null}
            </div>
          </SettingsCard>

          <div className="hu-settings-footer-note">
            <RotateCcw aria-hidden="true" size={14} />
            <span>Settings are saved on this device. Calendar connections are ready for a future integration.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsCard({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hu-settings-card" id={id} aria-labelledby={`${id}-title`}>
      <div className="hu-settings-card-header">
        <span className="hu-settings-card-icon" aria-hidden="true">{icon}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="hu-settings-card-body">{children}</div>
    </section>
  );
}

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="hu-settings-field">
      <span className="hu-settings-field-label">{label}</span>
      {children}
      {hint ? <span className="hu-settings-field-hint">{hint}</span> : null}
    </label>
  );
}

function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  tone = "default",
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tone?: "default" | "warning";
}) {
  return (
    <div className={`hu-settings-toggle ${tone === "warning" ? "is-warning" : ""}`}>
      <div className="hu-settings-toggle-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <button
        aria-checked={checked}
        className={`hu-settings-switch ${checked ? "is-on" : ""}`}
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span className="sr-only">{checked ? "On" : "Off"}</span>
        <span className="hu-settings-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
