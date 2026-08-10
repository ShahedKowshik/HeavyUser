"use client";

import {
  DragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Bell,
  CalendarRange,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Clock3,
  Flag,
  Flame,
  ListTodo,
  List,
  History,
  Play,
  Pencil,
  Plus,
  PlusCircle,
  Square,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";
import { ProfileMenu } from "@/components/profile-menu";
import { GoogleCalendarPanel } from "@/components/google-calendar-panel";
import { getAppPath, publicBasePath } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createTaskWriteQueue, loadRemoteTasks, persistRemoteTasks } from "@/lib/supabase/tasks";
import type { CalendarTransparency, CalendarVisibility, Priority, Task, TaskScheduleState } from "@/lib/tasks";
import type { ScheduleBlockSnapshot, TaskScheduleStatus } from "@/lib/scheduler/types";
import type { Space } from "@/lib/spaces";
import { formatElapsedSeconds, parseWorkMinutes, type ActiveTimerSnapshot, type MissedBlockSnapshot, type TaskWorkSession, type TaskWorkSummary, type TimerAlert } from "@/lib/timer/types";
import { clearPendingTimerOperation, getPendingTimerOperation } from "@/lib/timer/idempotency";
import { focusFirstElement, trapTabKey } from "@/lib/accessibility/focus";
import {
  CALENDAR_DATE as calendarDate,
  MAX_TASK_DURATION_MINUTES,
  MAX_TASK_TITLE_LENGTH,
  addCalendarDays,
  areTaskListsEquivalent,
  createTaskId,
  formatDuration,
  formatHeaderDateTime,
  formatShortDate,
  getDueDatePresets,
  getDurationParts,
  getLogicalDate,
  getTaskBucket,
  groupUpcomingTasks,
  isDeadlineOverdue,
  mapTasksToSpaces,
  matchesTaskBucket,
  mergeRemoteTasks,
  parseDuration,
  parseShortDate,
  readUserTasks,
  reconcileTaskSave,
  replaceBucketOrder,
  sortTasks,
  writeUserTasks,
  clearUserTasks,
  type TaskBucket,
  type UpcomingGroupId,
  type UpcomingTaskGroup,
} from "@/lib/task-rules";
type InlineEditField = "title";

const publicAssetPath = publicBasePath;

const priorityOptions = [
  { value: "urgent", label: "🔥 Urgent" },
  { value: "high", label: "🟡 High" },
  { value: "normal", label: "🟢 Normal" },
  { value: "low", label: "▼ Low" },
] satisfies ReadonlyArray<{ value: Priority; label: string }>;

const durationPresets = [
  { minutes: 15, label: "15m", dialogLabel: "15 min" },
  { minutes: 30, label: "30m", dialogLabel: "30 min" },
  { minutes: 45, label: "45m", dialogLabel: "45 min" },
  { minutes: 60, label: "1h", dialogLabel: "1 hr" },
  { minutes: 90, label: "1h 30m", dialogLabel: "1.5 hr" },
  { minutes: 120, label: "2h", dialogLabel: "2 hr" },
  { minutes: 150, label: "2h 30m", dialogLabel: "2.5 hr" },
  { minutes: 180, label: "3h", dialogLabel: "3 hr" },
  { minutes: 240, label: "4h", dialogLabel: "4 hr" },
  { minutes: 300, label: "5h", dialogLabel: "5 hr" },
] as const;

function handleMenuArrowNavigation(event: ReactKeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }

  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role^='menuitem']:not([aria-disabled='true'])"));
  if (items.length === 0) {
    return;
  }

  event.preventDefault();
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? items.length - 1
      : event.key === "ArrowDown"
        ? (currentIndex + 1 + items.length) % items.length
        : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex].focus();
}

const taskBucketOptions = [
  { value: "all", label: "All tasks", icon: List },
  { value: "today", label: "Today", icon: CalendarRange },
  { value: "upcoming", label: "Upcoming", icon: ListTodo },
  { value: "backlog", label: "Backlog", icon: Archive },
] as const;

const priorityLabels: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

function formatTaskDueDate(deadline: string | null) {
  return formatShortDate(deadline);
}

const scheduleStateLabels: Record<TaskScheduleState, string> = {
  scheduled: "Scheduled",
  scheduling: "Scheduling",
  needs_duration: "Needs duration",
  at_risk: "At risk",
  locked: "Locked",
  awaiting_completion: "Awaiting completion",
  paused: "Paused",
  calendar_error: "Calendar error",
};

function getScheduleLabel(task: Task, status: TaskScheduleStatus | undefined) {
  if (task.status === "done") {
    return null;
  }
  if (task.duration === null) {
    return "Needs duration";
  }
  return status ? scheduleStateLabels[status.state] : "Scheduling";
}

function formatScheduleBlock(block: ScheduleBlockSnapshot) {
  const start = new Date(block.start);
  const end = new Date(block.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const date = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { date, time: `${startTime}–${endTime}` };
}

function PriorityIcon({ priority }: { priority: Priority }) {
  const Icon = {
    urgent: Flame,
    high: TriangleAlert,
    normal: CircleCheck,
    low: CircleMinus,
  }[priority];

    const iconSize = priority === "urgent" ? 17 : 15;
    return <Icon aria-hidden="true" size={iconSize} strokeWidth={2.2} />;
}

type DateFieldProps = {
  ariaLabel: string;
  className: string;
  value: string;
  onChange: (value: string) => void;
};

function DateField({ ariaLabel, className, value, onChange }: DateFieldProps) {
  const [draft, setDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isNativePickerOpen, setIsNativePickerOpen] = useState(false);
  const dateFieldRef = useRef<HTMLSpanElement | null>(null);
  const nativePickerRef = useRef<HTMLInputElement | null>(null);

  function closeNativePicker() {
    nativePickerRef.current?.blur();
    setIsNativePickerOpen(false);
  }

  useEffect(() => {
    if (!isNativePickerOpen) {
      return;
    }

    function handleOutsidePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && dateFieldRef.current?.contains(event.target)) {
        return;
      }

      closeNativePicker();
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [isNativePickerOpen]);

  function commitDraft(nextValue: string) {
    if (!nextValue.trim()) {
      setDraft("");
      onChange("");
      return;
    }

    const parsedValue = parseShortDate(nextValue);
    if (parsedValue) {
      setDraft(formatShortDate(parsedValue));
      onChange(parsedValue);
      return;
    }

    setDraft(formatShortDate(value));
  }

  function openNativePicker() {
    const picker = nativePickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!picker) {
      return;
    }

    if (isNativePickerOpen) {
      closeNativePicker();
      return;
    }

    setIsNativePickerOpen(true);
    try {
      if (typeof picker.showPicker === "function") {
        picker.showPicker();
        return;
      }

      picker.click();
    } catch {
      setIsNativePickerOpen(false);
    }
  }

  return (
    <span className="hu-date-field" ref={dateFieldRef}>
      <input
        aria-label={ariaLabel}
        className={className}
        inputMode="text"
        onFocus={() => {
          closeNativePicker();
          setDraft(formatShortDate(value));
          setIsEditing(true);
        }}
        onBlur={(event) => {
          commitDraft(event.target.value);
          setIsEditing(false);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!event.target.value.trim()) {
            onChange("");
          } else {
            const parsedValue = parseShortDate(event.target.value);
            if (parsedValue) {
              onChange(parsedValue);
            }
          }
        }}
        placeholder="DD MMM YY"
        type="text"
        value={isEditing ? draft : formatShortDate(value)}
      />
      <button
        aria-label={`Choose ${ariaLabel.toLowerCase()}`}
        aria-expanded={isNativePickerOpen}
        aria-haspopup="dialog"
        className="hu-date-picker-button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={openNativePicker}
      >
        <CalendarDays aria-hidden="true" size={13} />
      </button>
      <input
        aria-hidden="true"
        className="hu-date-picker-native"
        ref={nativePickerRef}
        tabIndex={-1}
        type="date"
        value={value}
        onBlur={() => setIsNativePickerOpen(false)}
        onChange={(event) => {
          closeNativePicker();
          onChange(event.target.value);
          setDraft(formatShortDate(event.target.value));
          setIsEditing(false);
        }}
      />
    </span>
  );
}

type QuickDateFieldProps = DateFieldProps & {
  fieldLabel: string;
  today: string;
};

function QuickDateField({ ariaLabel, className, fieldLabel, today, value, onChange }: QuickDateFieldProps) {
  const tomorrow = addCalendarDays(today, 1);
  const isCustomDate = Boolean(value && value !== today && value !== tomorrow);
  const [isCustomOpen, setIsCustomOpen] = useState(isCustomDate);
  const presets = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: tomorrow },
  ] as const;

  return (
    <div aria-label={fieldLabel} className="hu-edit-field hu-dialog-date-field" role="group">
      <span className="hu-field-label">{fieldLabel}</span>
      <div className="hu-dialog-date-presets">
        {presets.map((preset) => (
          <button
            aria-pressed={value === preset.value}
            className="hu-dialog-date-preset"
            key={preset.value}
            type="button"
            onClick={() => {
              onChange(preset.value);
              setIsCustomOpen(false);
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          aria-pressed={isCustomOpen || isCustomDate}
          className="hu-dialog-date-preset"
          type="button"
          onClick={() => setIsCustomOpen(true)}
        >
          Custom
        </button>
      </div>
      {isCustomOpen || isCustomDate ? (
        <DateField
          ariaLabel={ariaLabel}
          className={className}
          value={value}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

type PriorityPickerProps = {
  ariaLabel: string;
  value: Priority;
  onChange: (value: Priority) => void;
};

function PriorityPicker({ ariaLabel, onChange, value }: PriorityPickerProps) {
  return (
    <div aria-label={ariaLabel} className="hu-priority-picker" role="group">
      {priorityOptions.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={`hu-priority-choice is-${option.value}`}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          <PriorityIcon priority={option.value} />
          <span>{priorityLabels[option.value]}</span>
        </button>
      ))}
    </div>
  );
}

type SpacePickerProps = {
  spaces: ReadonlyArray<Space>;
  spaceId: string;
  subSpaceId: string;
  onSpaceChange: (value: string) => void;
  onSubSpaceChange: (value: string) => void;
};

function SpacePicker({ onSpaceChange, onSubSpaceChange, spaceId, spaces, subSpaceId }: SpacePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  const selectedSubSpace = selectedSpace?.subSpaces.find((subSpace) => subSpace.id === subSpaceId);
  const selectableSpaces = spaces.filter((space) => space.status === "active" || space.id === spaceId);
  const selectableSubSpaces = (selectedSpace?.subSpaces ?? []).filter((subSpace) => subSpace.status === "active" || subSpace.id === subSpaceId);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && pickerRef.current?.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
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

  function handleSpaceSelect(nextSpaceId: string) {
    const nextSpace = spaces.find((space) => space.id === nextSpaceId);
    if (!nextSpace || nextSpace.status !== "active") {
      return;
    }

    onSpaceChange(nextSpaceId);
    onSubSpaceChange("");
  }

  return (
    <div className="hu-edit-field hu-space-picker" ref={pickerRef}>
      <span className="hu-field-label">Space &amp; sub-space <span aria-hidden="true">*</span></span>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Choose task Space and sub-space"
        className="hu-space-picker-trigger hu-edit-input"
        disabled={spaces.length === 0}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="hu-space-picker-value">
          {selectedSpace?.name ?? "Choose a Space"}
          <small>{selectedSubSpace?.name ?? "Space only"}</small>
        </span>
        <ChevronDown aria-hidden="true" size={14} />
      </button>
      {isOpen ? (
        <div aria-label="Choose task Space and sub-space" className="hu-space-picker-menu" role="dialog">
          <span className="hu-popover-kicker">Space</span>
          <div className="hu-space-picker-options">
            {selectableSpaces.length > 0 ? selectableSpaces.map((space) => {
              const isDisabled = space.status !== "active";
              return (
                <label className={`hu-space-picker-option ${isDisabled ? "is-disabled" : ""}`} key={space.id}>
                  <input
                    checked={space.id === spaceId}
                    disabled={isDisabled}
                    type="checkbox"
                    onChange={() => handleSpaceSelect(space.id)}
                  />
                  <span aria-hidden="true" className="hu-space-picker-check"><Check size={12} /></span>
                  <span className="hu-space-picker-option-copy">
                    <strong>{space.name}</strong>
                    <small>{space.status === "archived" ? "Archived" : space.status === "disconnected" ? "Reconnect calendar" : "Space"}</small>
                  </span>
                </label>
              );
            }) : <span className="hu-space-picker-empty">Add a calendar first.</span>}
          </div>
          <div className="hu-popover-divider" role="presentation" />
          <span className="hu-popover-kicker">Sub-space</span>
          <div className="hu-space-picker-options">
            <label className={`hu-space-picker-option ${!spaceId ? "is-disabled" : ""}`}>
              <input
                checked={Boolean(spaceId) && !subSpaceId}
                disabled={!spaceId}
                type="checkbox"
                onChange={() => onSubSpaceChange("")}
              />
              <span aria-hidden="true" className="hu-space-picker-check"><Check size={12} /></span>
              <span className="hu-space-picker-option-copy">
                <strong>Space only</strong>
                <small>No sub-space</small>
              </span>
            </label>
            {selectableSubSpaces.map((subSpace) => {
              const isDisabled = subSpace.status !== "active";
              return (
                <label className={`hu-space-picker-option ${isDisabled ? "is-disabled" : ""}`} key={subSpace.id}>
                  <input
                    checked={subSpace.id === subSpaceId}
                    disabled={isDisabled}
                    type="checkbox"
                    onChange={() => onSubSpaceChange(subSpace.id)}
                  />
                  <span aria-hidden="true" className="hu-space-picker-check"><Check size={12} /></span>
                  <span className="hu-space-picker-option-copy">
                    <strong>{subSpace.name}</strong>
                    <small>{subSpace.status === "archived" ? "Archived" : "Sub-space"}</small>
                  </span>
                </label>
              );
            })}
            {spaceId && selectableSubSpaces.length === 0 ? <span className="hu-space-picker-empty">No sub-spaces yet.</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<ReadonlyArray<Task>>([]);
  const tasksRef = useRef<ReadonlyArray<Task>>([]);
  tasksRef.current = tasks;
  const [supabaseClient] = useState(() => getSupabaseBrowserClient());
  const { status: authStatus, user: authUser, settings, updateSettings } = useAuth();
  const [remoteSyncReady, setRemoteSyncReady] = useState(false);
  const [pendingRemoteDeletes, setPendingRemoteDeletes] = useState<ReadonlyArray<string>>([]);
  const [taskSyncNotice, setTaskSyncNotice] = useState("");
  const [taskSaveRetryVersion, setTaskSaveRetryVersion] = useState(0);
  const [taskWriteQueue] = useState(createTaskWriteQueue);
  const [isCustomOrder, setIsCustomOrder] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [activeBucket, setActiveBucket] = useState<TaskBucket>("all");
  const [collapsedUpcomingGroupIds, setCollapsedUpcomingGroupIds] = useState<ReadonlyArray<UpcomingGroupId>>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState("");
  const [newTaskStartDate, setNewTaskStartDate] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("normal");
  const [newTaskSpaceId, setNewTaskSpaceId] = useState("");
  const [newTaskSubSpaceId, setNewTaskSubSpaceId] = useState("");
  const [taskComposerError, setTaskComposerError] = useState("");
  const [taskActionError, setTaskActionError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDuration, setEditingDuration] = useState("");
  const [editingStartDate, setEditingStartDate] = useState("");
  const [editingDeadline, setEditingDeadline] = useState("");
  const [editingPriority, setEditingPriority] = useState<Priority>("normal");
  const [editingSpaceId, setEditingSpaceId] = useState("");
  const [editingSubSpaceId, setEditingSubSpaceId] = useState("");
  const [editingError, setEditingError] = useState("");
  const [editingMinBlockMinutes, setEditingMinBlockMinutes] = useState("");
  const [editingMaxBlockMinutes, setEditingMaxBlockMinutes] = useState("");
  const [editingCalendarVisibility, setEditingCalendarVisibility] = useState<CalendarVisibility | null>(null);
  const [editingCalendarTransparency, setEditingCalendarTransparency] = useState<CalendarTransparency | null>(null);
  const [scheduleStatuses, setScheduleStatuses] = useState<Record<string, TaskScheduleStatus>>({});
  const [scheduleBlocks, setScheduleBlocks] = useState<Record<string, ReadonlyArray<ScheduleBlockSnapshot>>>({});
  const [activeTimer, setActiveTimer] = useState<ActiveTimerSnapshot | null>(null);
  const [timerElapsedSeconds, setTimerElapsedSeconds] = useState(0);
  const [taskWorkSummaries, setTaskWorkSummaries] = useState<Readonly<Record<string, TaskWorkSummary>>>({});
  const [missedBlocks, setMissedBlocks] = useState<ReadonlyArray<MissedBlockSnapshot>>([]);
  const [timerAlerts, setTimerAlerts] = useState<ReadonlyArray<TimerAlert>>([]);
  const [timerRequestTaskId, setTimerRequestTaskId] = useState<string | null>(null);
  const [loggingWorkTaskId, setLoggingWorkTaskId] = useState<string | null>(null);
  const [loggingWorkMinutes, setLoggingWorkMinutes] = useState("30");
  const [timerNotice, setTimerNotice] = useState("");
  const [correctingSessionId, setCorrectingSessionId] = useState<string | null>(null);
  const [correctingMinutes, setCorrectingMinutes] = useState("");
  const [correctionReason, setCorrectionReason] = useState("Corrected work time");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState("");
  const [schedulerError, setSchedulerError] = useState("");
  const [spaces, setSpaces] = useState<ReadonlyArray<Space>>([]);
  const [spaceError, setSpaceError] = useState("");
  const [inlineEdit, setInlineEdit] = useState<{
    taskId: string;
    field: InlineEditField;
  } | null>(null);
  const [priorityMenuTaskId, setPriorityMenuTaskId] = useState<string | null>(null);
  const [durationMenuTaskId, setDurationMenuTaskId] = useState<string | null>(null);
  const [dueDateMenuTaskId, setDueDateMenuTaskId] = useState<string | null>(null);
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const newTaskInputRef = useRef<HTMLInputElement | null>(null);
  const editingDurationInputRef = useRef<HTMLInputElement | null>(null);
  const loggingWorkInputRef = useRef<HTMLInputElement | null>(null);
  const priorityMenuRef = useRef<HTMLDivElement | null>(null);
  const durationMenuRef = useRef<HTMLDivElement | null>(null);
  const dueDateMenuRef = useRef<HTMLDivElement | null>(null);
  const taskDialogRef = useRef<HTMLFormElement | null>(null);
  const editDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const schedulerRunTimerRef = useRef<number | null>(null);
  const schedulerRunInFlightRef = useRef(false);
  const schedulerRunQueuedRef = useRef(false);
  const schedulerSnapshotPollTimerRef = useRef<number | null>(null);
  const scheduleSnapshotRequestRef = useRef<Promise<void> | null>(null);
  const spacesUpdateVersionRef = useRef(0);
  const spacesRef = useRef<ReadonlyArray<Space>>([]);
  const taskSaveBaselineRef = useRef<ReadonlyArray<Task>>([]);
  const taskSyncAccountRef = useRef("");
  const customOrderSaveInFlightRef = useRef(false);
  const customTaskOrderRef = useRef(settings.customTaskOrder);
  customTaskOrderRef.current = settings.customTaskOrder;
  const authUserId = authUser?.id ?? "";

  const applySpaces = useCallback((rawSpaces: ReadonlyArray<Space>) => {
    spacesUpdateVersionRef.current += 1;
    const nextSpaces = rawSpaces.filter((space) => space && typeof space.id === "string");
    spacesRef.current = nextSpaces;
    setSpaces(nextSpaces);
    setSpaceError("");

    const activeSpace = nextSpaces.find((space) => space.status === "active");
    const storageKey = `heavyuser:last-space:${authUserId}`;
    let rememberedSpaceId = "";
    try { rememberedSpaceId = window.localStorage.getItem(storageKey) ?? ""; } catch { /* cloud remains authoritative */ }
    const nextDefaultSpaceId = nextSpaces.some((space) => space.id === rememberedSpaceId && space.status === "active")
      ? rememberedSpaceId
      : activeSpace?.id ?? "";
    setNewTaskSpaceId((current) => current && nextSpaces.some((space) => space.id === current && space.status === "active") ? current : nextDefaultSpaceId);
    setTasks((current) => {
      const nextTasks = mapTasksToSpaces(current, nextSpaces);
      return nextTasks.every((task, index) => task === current[index]) ? current : nextTasks;
    });
  }, [authUserId]);

  useEffect(() => () => {
    if (schedulerRunTimerRef.current !== null) {
      window.clearTimeout(schedulerRunTimerRef.current);
    }
    if (schedulerSnapshotPollTimerRef.current !== null) {
      window.clearInterval(schedulerSnapshotPollTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const updateDateTime = () => setCurrentDateTime(Date.now());
    updateDateTime();
    const intervalId = window.setInterval(updateDateTime, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    function handleQuickAddShortcut(event: globalThis.KeyboardEvent) {
      if (event.key.toLowerCase() !== "q" || event.metaKey || event.ctrlKey || event.altKey || editingId) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      if (isAdding) {
        newTaskInputRef.current?.focus();
      } else {
        setIsAdding(true);
      }
    }

    document.addEventListener("keydown", handleQuickAddShortcut);
    return () => document.removeEventListener("keydown", handleQuickAddShortcut);
  }, [editingId, isAdding]);

  useEffect(() => {
    if (!isAdding) {
      return;
    }

    function handleTaskComposerKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setNewTaskTitle("");
      setNewTaskDuration("");
      setNewTaskStartDate("");
      setNewTaskDeadline("");
      setNewTaskPriority("normal");
      setIsAdding(false);
    }

    document.addEventListener("keydown", handleTaskComposerKeyDown);
    return () => document.removeEventListener("keydown", handleTaskComposerKeyDown);
  }, [isAdding]);

  useEffect(() => {
    if (isAdding) {
      newTaskInputRef.current?.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    let isCancelled = false;
    let retryTimerId: number | null = null;

    const restoreTasks = async () => {
      if (!authUserId || authStatus !== "signed_in") {
        return;
      }

      const account = { id: authUserId };
      const localTasks = mapTasksToSpaces(readUserTasks(window.localStorage, authUserId), spacesRef.current);
      setTasks([]);
      tasksRef.current = [];
      setRemoteSyncReady(false);
      taskSaveBaselineRef.current = [];
      taskSyncAccountRef.current = authUserId;
      setIsHydrated(false);
      setPendingRemoteDeletes([]);
      setIsCustomOrder(customTaskOrderRef.current);
      customOrderSaveInFlightRef.current = false;
      setEditingId(null);
      setScheduleStatuses({});
      setScheduleBlocks({});
      setActiveTimer(null);
      setTimerElapsedSeconds(0);
      setTaskWorkSummaries({});
      setMissedBlocks([]);
      setTimerAlerts([]);
      setLoggingWorkTaskId(null);
      setLoggingWorkMinutes("30");
      setTimerNotice("");
      setTaskSyncNotice("");
      setSchedulerError("");

      if (isCancelled) {
        return;
      }

      // Show the account's local snapshot immediately. The remote response
      // remains authoritative below, while remoteSyncReady keeps this cached
      // snapshot from being written back before that response arrives.
      setTasks(localTasks);
      tasksRef.current = localTasks;
      setIsHydrated(true);

      if (!supabaseClient) {
        return;
      }

      const loadCloudSnapshot = async () => {
        try {
          const remoteTasks = await loadRemoteTasks(supabaseClient, account);
          if (isCancelled || taskSyncAccountRef.current !== authUserId) {
            return;
          }

          const merged = mergeRemoteTasks(localTasks, tasksRef.current, remoteTasks);
          const normalizedRemoteTasks = mapTasksToSpaces(remoteTasks, spacesRef.current);
          const normalizedTasks = mapTasksToSpaces(merged.tasks, spacesRef.current);
          taskSaveBaselineRef.current = normalizedRemoteTasks;
          tasksRef.current = normalizedTasks;
          setTasks(normalizedTasks);
          if (normalizedTasks.length === 0 && remoteTasks.length === 0) {
            clearUserTasks(window.localStorage, authUserId);
          } else {
            writeUserTasks(window.localStorage, authUserId, normalizedTasks);
          }

          if (merged.deletedTaskIds.length > 0) {
            setPendingRemoteDeletes((currentIds) => [...new Set([...currentIds, ...merged.deletedTaskIds])]);
          }
          setTaskSyncNotice("");
          setRemoteSyncReady(true);
          void loadScheduleSnapshot();
        } catch {
          if (isCancelled) {
            return;
          }
          setTaskSyncNotice("Your tasks are safe on this device. Cloud sync is offline and will retry.");
          retryTimerId = window.setTimeout(() => void loadCloudSnapshot(), 5_000);
        }
      };

      void loadCloudSnapshot();
    };

    void restoreTasks();
    return () => {
      isCancelled = true;
      if (retryTimerId !== null) {
        window.clearTimeout(retryTimerId);
      }
    };
  }, [authStatus, authUserId, supabaseClient]);

  useEffect(() => {
    if (!authUserId || authStatus !== "signed_in") {
      return;
    }
    let isCancelled = false;
    const requestVersion = spacesUpdateVersionRef.current;
    void fetch(getAppPath("/api/spaces"), { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; error?: string } | null;
        if (!response.ok) throw new Error(body?.error ?? "Spaces could not be loaded.");
        if (isCancelled || requestVersion !== spacesUpdateVersionRef.current) return;
        applySpaces(body?.spaces ?? []);
      })
      .catch((error: unknown) => {
        if (!isCancelled) setSpaceError(error instanceof Error ? error.message : "Spaces could not be loaded.");
      });
    return () => { isCancelled = true; };
  }, [applySpaces, authStatus, authUserId]);

  useEffect(() => {
    if (isHydrated && authUserId) {
      writeUserTasks(window.localStorage, authUserId, tasks);
    }
  }, [authUserId, isHydrated, tasks]);

  useEffect(() => {
    if (!supabaseClient || !authUserId || !remoteSyncReady || !isHydrated) {
      return;
    }

    const deletedTaskIds = pendingRemoteDeletes;
    const localTasks = tasks;
    const accountId = authUserId;
    const account = { id: accountId };
    let isCancelled = false;
    let retryTimerId: number | null = null;

    const timeoutId = window.setTimeout(() => {
      void taskWriteQueue.enqueue(async () => {
        const loadedRemoteTasks = await loadRemoteTasks(supabaseClient, account);
        if (taskSyncAccountRef.current !== accountId) {
          throw new Error("Task sync account changed.");
        }
        const remoteTasks = mapTasksToSpaces(loadedRemoteTasks, spacesRef.current);
        const reconciled = reconcileTaskSave(
          taskSaveBaselineRef.current,
          localTasks,
          remoteTasks,
          deletedTaskIds,
        );
        await persistRemoteTasks(supabaseClient, account, reconciled.tasks, reconciled.deletedTaskIds);
        if (taskSyncAccountRef.current === accountId) {
          taskSaveBaselineRef.current = reconciled.tasks;
        }
        return reconciled;
      })
      .then((reconciled) => {
        if (isCancelled || taskSyncAccountRef.current !== accountId) {
          return;
        }

        if (areTaskListsEquivalent(tasksRef.current, localTasks)
          && !areTaskListsEquivalent(localTasks, reconciled.tasks)) {
          tasksRef.current = reconciled.tasks;
          setTasks(reconciled.tasks);
        }
        setPendingRemoteDeletes((currentIds) => {
          const nextIds = currentIds.filter((taskId) => !deletedTaskIds.includes(taskId));
          // Keep the same array reference when there is nothing to clear. The
          // persistence effect depends on this value, so returning a fresh
          // empty array would start another save after every successful save.
          return nextIds.length === currentIds.length ? currentIds : nextIds;
        });
        setTaskSyncNotice(reconciled.conflicts.length > 0
          ? "Another tab changed the same task. HeavyUser kept the newest cloud copy."
          : "");
        requestSchedulerRun();
      })
      .catch((error: unknown) => {
        if (isCancelled || taskSyncAccountRef.current !== accountId) return;
        setTaskSyncNotice(error instanceof Error && error.message.includes("running timer")
          ? "Stop the timer on the other device before deleting this task."
          : "Your changes are safe on this device. Cloud sync failed and will retry.");
        retryTimerId = window.setTimeout(() => {
          if (!isCancelled) setTaskSaveRetryVersion((version) => version + 1);
        }, 3_000);
      });
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
      if (retryTimerId !== null) {
        window.clearTimeout(retryTimerId);
      }
    };
    // The scheduler helper is intentionally stable for this persistence lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, isHydrated, pendingRemoteDeletes, remoteSyncReady, supabaseClient, taskSaveRetryVersion, taskWriteQueue, tasks]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && topbarRef.current?.contains(event.target)) {
        return;
      }

      setIsNotificationsOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsNotificationsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!priorityMenuTaskId && !durationMenuTaskId && !dueDateMenuTaskId) {
      return;
    }

    function handleTaskPopoverPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        (priorityMenuRef.current?.contains(event.target) ||
          durationMenuRef.current?.contains(event.target) ||
          dueDateMenuRef.current?.contains(event.target))
      ) {
        return;
      }

      setPriorityMenuTaskId(null);
      setDurationMenuTaskId(null);
      setDueDateMenuTaskId(null);
    }

    function handleTaskPopoverKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        const returnFocus = priorityMenuRef.current?.querySelector<HTMLElement>("[aria-haspopup='menu']")
          ?? durationMenuRef.current?.querySelector<HTMLElement>("[aria-haspopup='dialog']")
          ?? dueDateMenuRef.current?.querySelector<HTMLElement>("[aria-haspopup='dialog']")
          ?? null;
        setPriorityMenuTaskId(null);
        setDurationMenuTaskId(null);
        setDueDateMenuTaskId(null);
        window.requestAnimationFrame(() => returnFocus?.focus());
      }
    }

    document.addEventListener("pointerdown", handleTaskPopoverPointerDown);
    document.addEventListener("keydown", handleTaskPopoverKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleTaskPopoverPointerDown);
      document.removeEventListener("keydown", handleTaskPopoverKeyDown);
    };
  }, [priorityMenuTaskId, durationMenuTaskId, dueDateMenuTaskId]);

  useEffect(() => {
    if (!priorityMenuTaskId) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      priorityMenuRef.current?.querySelector<HTMLElement>("[role^='menuitem']")?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [priorityMenuTaskId]);

  useEffect(() => {
    if (!editingId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frameId = window.requestAnimationFrame(() => {
      const dialog = taskDialogRef.current;
      if (dialog && !dialog.contains(document.activeElement)) {
        focusFirstElement(dialog);
      }
    });

    function handleEditDialogKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Tab" && taskDialogRef.current) {
        trapTabKey(event, taskDialogRef.current);
        return;
      }
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      handleCancelEditing();
    }

    document.addEventListener("keydown", handleEditDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEditDialogKeyDown);
      const returnFocus = editDialogReturnFocusRef.current;
      editDialogReturnFocusRef.current = null;
      window.requestAnimationFrame(() => returnFocus?.focus());
    };
  }, [editingId]);

  useEffect(() => {
    if (!loggingWorkTaskId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => loggingWorkInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [loggingWorkTaskId]);

  function getAppToday() {
    return currentDateTime === null ? calendarDate : getLogicalDate(currentDateTime, settings);
  }

  async function loadScheduleSnapshot() {
    if (scheduleSnapshotRequestRef.current) {
      return scheduleSnapshotRequestRef.current;
    }

    const request = (async () => {
      try {
        const [response, timerResponse] = await Promise.all([
          fetch(getAppPath("/api/scheduler/status"), { cache: "no-store" }),
          fetch(getAppPath("/api/timer/status"), { cache: "no-store" }),
        ]);

        if (response.ok) {
          const body = (await response.json().catch(() => null)) as {
            statuses?: ReadonlyArray<TaskScheduleStatus>;
            blocks?: ReadonlyArray<ScheduleBlockSnapshot>;
          } | null;
          const nextStatuses: Record<string, TaskScheduleStatus> = {};
          for (const status of body?.statuses ?? []) {
            nextStatuses[status.taskId] = status;
          }
          const nextBlocks: Record<string, Array<ScheduleBlockSnapshot>> = {};
          for (const block of body?.blocks ?? []) {
            (nextBlocks[block.taskId] ??= []).push(block);
          }
          setScheduleStatuses(nextStatuses);
          setScheduleBlocks(nextBlocks);
          setSchedulerError("");
        } else {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setSchedulerError(body?.error ?? "Scheduling status could not be loaded.");
        }

        if (timerResponse.ok) {
          const timerBody = (await timerResponse.json().catch(() => null)) as {
            activeSession?: ActiveTimerSnapshot | null;
            sessionsByTask?: Readonly<Record<string, TaskWorkSummary>>;
            missedBlocks?: ReadonlyArray<MissedBlockSnapshot>;
            alerts?: ReadonlyArray<TimerAlert>;
          } | null;
          setActiveTimer(timerBody?.activeSession ?? null);
          setTimerElapsedSeconds(timerBody?.activeSession?.elapsedSeconds ?? 0);
          setTaskWorkSummaries(timerBody?.sessionsByTask ?? {});
          setMissedBlocks(timerBody?.missedBlocks ?? []);
          setTimerAlerts(timerBody?.alerts ?? []);
        } else if (response.ok) {
          const timerBody = (await timerResponse.json().catch(() => null)) as { error?: string } | null;
          setSchedulerError(timerBody?.error ?? "Timer history could not be loaded. Try refreshing.");
        }
      } catch {
        setSchedulerError("Scheduling status could not be loaded. We will try again.");
      }
    })();
    scheduleSnapshotRequestRef.current = request;

    try {
      await request;
    } finally {
      if (scheduleSnapshotRequestRef.current === request) {
        scheduleSnapshotRequestRef.current = null;
      }
    }
  }

  useEffect(() => {
    // The event listener intentionally calls the schedule loader without
    // making the page rebind it on every render.
    const refreshScheduleSnapshot = () => {
      void loadScheduleSnapshot();
    };
    window.addEventListener("heavyuser:schedule-refresh", refreshScheduleSnapshot);
    return () => window.removeEventListener("heavyuser:schedule-refresh", refreshScheduleSnapshot);
  }, []);

  useEffect(() => {
    if (!activeTimer) {
      return;
    }

    const updateElapsed = () => {
      const serverTimestamp = new Date(activeTimer.serverNow).getTime();
      const serverDrift = Number.isFinite(serverTimestamp) ? Math.max(0, Math.floor((Date.now() - serverTimestamp) / 1000)) : 0;
      setTimerElapsedSeconds(activeTimer.elapsedSeconds + serverDrift);
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeTimer]);

  useEffect(() => {
    if (!authUserId || authStatus !== "signed_in") return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadScheduleSnapshot();
    }, 15_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void loadScheduleSnapshot();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authStatus, authUserId]);

  function requestSchedulerRun(delayMs = 400) {
    if (schedulerRunInFlightRef.current) {
      schedulerRunQueuedRef.current = true;
      return;
    }

    if (schedulerRunTimerRef.current !== null) {
      window.clearTimeout(schedulerRunTimerRef.current);
    }

    schedulerRunTimerRef.current = window.setTimeout(() => {
      schedulerRunTimerRef.current = null;
      if (schedulerRunInFlightRef.current) {
        schedulerRunQueuedRef.current = true;
        return;
      }

      schedulerRunInFlightRef.current = true;
      schedulerSnapshotPollTimerRef.current = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void loadScheduleSnapshot();
        }
      }, 500);
      void loadScheduleSnapshot();
      void (async () => {
        let retryDelay: number | null = null;
        try {
          const response = await fetch(getAppPath("/api/scheduler/run"), { method: "POST" });
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            setSchedulerError(body?.error ?? "Scheduling could not finish. We will try again.");
            if (response.status === 409) {
              schedulerRunQueuedRef.current = true;
              retryDelay = 1_000;
            }
          } else {
            setSchedulerError("");
          }
        } catch {
          setSchedulerError("Scheduling could not finish. We will try again.");
        } finally {
          if (schedulerSnapshotPollTimerRef.current !== null) {
            window.clearInterval(schedulerSnapshotPollTimerRef.current);
            schedulerSnapshotPollTimerRef.current = null;
          }
          await loadScheduleSnapshot();
          window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
          schedulerRunInFlightRef.current = false;
          if (schedulerRunQueuedRef.current) {
            schedulerRunQueuedRef.current = false;
            requestSchedulerRun(retryDelay ?? 0);
          }
        }
      })();
    }, delayMs);
  }

  async function handleStartTimer(taskId: string, options: { choice?: "overlap" | "next_free"; reopen?: boolean; missedBlockId?: string } = {}) {
    if (timerRequestTaskId) return;
    setTimerRequestTaskId(taskId);
    setTimerNotice("");
    const startedAt = new Date().toISOString();
    try {
      const response = await fetch(getAppPath("/api/timer/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, startedAt, ...options }),
      });
      const body = (await response.json().catch(() => null)) as { code?: string; error?: string; warning?: string } | null;
      if (!response.ok && body?.code === "busy_now" && !options.choice) {
        const overlap = window.confirm("Now is busy in Google Calendar. Press OK to start anyway and keep the overlap, or Cancel to schedule the task for the next free time.");
        setTimerRequestTaskId(null);
        await handleStartTimer(taskId, { ...options, choice: overlap ? "overlap" : "next_free" });
        return;
      }
      if (!response.ok && body?.code === "task_done" && !options.reopen) {
        const reopen = window.confirm("This task is complete. Reopen it and start the timer?");
        if (reopen) {
          setTimerRequestTaskId(null);
          await handleStartTimer(taskId, { ...options, reopen: true });
        }
        return;
      }
      if (!response.ok) {
        throw new Error(body?.error ?? "The timer could not start.");
      }
      if (options.reopen) {
        setTasks((currentTasks) => currentTasks.map((task) => task.id === taskId ? { ...task, status: "focus" } : task.status === "focus" ? { ...task, status: "open" } : task));
      }
      setTimerNotice(body?.warning ?? "Timer started.");
      await loadScheduleSnapshot();
      window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
    } catch (error) {
      setTimerNotice(error instanceof Error ? error.message : "The timer could not start.");
    } finally {
      setTimerRequestTaskId(null);
    }
  }

  async function handleStopTimer(options: { complete?: boolean } = {}) {
    if (!activeTimer || timerRequestTaskId) return false;
    const taskId = activeTimer.session.taskId;
    setTimerRequestTaskId(taskId);
    setTimerNotice("");
    const pendingOperation = getPendingTimerOperation(
      window.sessionStorage,
      authUser?.id ?? "signed-out",
      "stop",
      `${activeTimer.session.id}:${options.complete === true ? "complete" : "keep-open"}`,
      () => ({ requestKey: crypto.randomUUID(), stoppedAt: new Date().toISOString() }),
    );

    const sendStop = async (action?: "finish" | "keep_long" | "split") => {
      const response = await fetch(getAppPath("/api/timer/stop"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeTimer.session.id,
          stoppedAt: pendingOperation.stoppedAt,
          action,
          complete: options.complete === true,
        }),
      });
      const body = (await response.json().catch(() => null)) as { code?: string; error?: string; warning?: string; schedulerWarning?: string | null } | null;
      return { response, body };
    };

    try {
      let result = await sendStop(options.complete ? "finish" : undefined);
      if (!result.response.ok && result.body?.code === "estimate_reached" && !options.complete) {
        const finish = window.confirm("You reached the estimate. Press OK to stop and leave the task open, or Cancel to keep working.");
        if (!finish) {
          clearPendingTimerOperation(window.sessionStorage, pendingOperation.storageKey);
          return false;
        }
        result = await sendStop("finish");
      }
      if (!result.response.ok && result.body?.code === "overrun_review") {
        const keepLong = window.confirm("This session is longer than one calendar block. Press OK to keep one long calendar block, or Cancel to split it into blocks.");
        result = await sendStop(keepLong ? "keep_long" : "split");
      }
      if (!result.response.ok) {
        throw new Error(result.body?.error ?? "The timer could not stop.");
      }
      clearPendingTimerOperation(window.sessionStorage, pendingOperation.storageKey);
      if (options.complete) {
        setTasks((currentTasks) => {
          const nextOpenTask = currentTasks.find((task) => task.id !== taskId && task.status !== "done")?.id ?? null;
          return currentTasks.map((task) => {
            if (task.id === taskId) return { ...task, status: "done" };
            if (task.status === "focus") return { ...task, status: task.id === nextOpenTask ? "focus" : "open" };
            return task.id === nextOpenTask ? { ...task, status: "focus" } : task;
          });
        });
      }
      setTimerNotice(result.body?.warning ?? result.body?.schedulerWarning ?? "Work saved.");
      await loadScheduleSnapshot();
      window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
      return true;
    } catch (error) {
      setTimerNotice(error instanceof Error ? error.message : "The timer could not stop.");
      return false;
    } finally {
      setTimerRequestTaskId(null);
    }
  }

  function handleBeginLogWork(taskId: string) {
    if (timerRequestTaskId || !tasks.some((task) => task.id === taskId)) {
      return;
    }

    setSessionActionError("");
    setTimerNotice("");
    setLoggingWorkMinutes("30");
    setLoggingWorkTaskId((currentTaskId) => (currentTaskId === taskId ? null : taskId));
  }

  function handleCancelLogWork() {
    setLoggingWorkTaskId(null);
    setLoggingWorkMinutes("30");
    setSessionActionError("");
  }

  async function handleLogWork(
    taskId: string,
    range?: { startedAt: string; stoppedAt: string; blockId?: string },
    minutesText = loggingWorkMinutes,
  ) {
    if (timerRequestTaskId) return;
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    const minutes = range
      ? Math.round((new Date(range.stoppedAt).getTime() - new Date(range.startedAt).getTime()) / 60_000)
      : parseWorkMinutes(minutesText);
    if (minutes === null || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
      setSessionActionError("Enter a number from 1 to 1440 minutes.");
      return;
    }
    const requestedStoppedAt = range?.stoppedAt ?? new Date().toISOString();
    const requestedStartedAt = range?.startedAt ?? new Date(new Date(requestedStoppedAt).getTime() - minutes * 60_000).toISOString();
    const fingerprint = range
      ? `${taskId}:${range.blockId ?? "range"}:${requestedStartedAt}:${requestedStoppedAt}`
      : `${taskId}:manual:${minutes}`;
    const pendingOperation = getPendingTimerOperation(
      window.sessionStorage,
      authUser?.id ?? "signed-out",
      "log-work",
      fingerprint,
      () => ({ requestKey: crypto.randomUUID(), startedAt: requestedStartedAt, stoppedAt: requestedStoppedAt }),
    );
    const startedAt = pendingOperation.startedAt ?? requestedStartedAt;
    const stoppedAt = pendingOperation.stoppedAt ?? requestedStoppedAt;
    setSessionActionError("");
    setTimerRequestTaskId(taskId);
    try {
      const response = await fetch(getAppPath("/api/timer/log-work"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, startedAt, stoppedAt, requestKey: pendingOperation.requestKey, missedBlockId: range?.blockId }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; warning?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Work could not be logged.");
      clearPendingTimerOperation(window.sessionStorage, pendingOperation.storageKey);
      setLoggingWorkTaskId(null);
      setLoggingWorkMinutes("30");
      setTimerNotice(body?.warning ?? "Work logged.");
      await loadScheduleSnapshot();
      window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
    } catch (error) {
      setSessionActionError(error instanceof Error ? error.message : "Work could not be logged.");
    } finally {
      setTimerRequestTaskId(null);
    }
  }

  async function handleAddTime() {
    if (!activeTimer || timerRequestTaskId) return;
    const minutesText = window.prompt("Add how many minutes to this task?", "30");
    if (minutesText === null) return;
    const minutes = Math.round(Number(minutesText));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
      setTimerNotice("Enter a number from 1 to 1440 minutes.");
      return;
    }
    const pendingOperation = getPendingTimerOperation(
      window.sessionStorage,
      authUser?.id ?? "signed-out",
      "add-time",
      `${activeTimer.session.id}:${minutes}`,
      () => ({ requestKey: crypto.randomUUID() }),
    );
    setTimerRequestTaskId(activeTimer.session.taskId);
    try {
      const response = await fetch(getAppPath("/api/timer/add-time"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, requestKey: pendingOperation.requestKey }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; warning?: string; schedulerWarning?: string | null } | null;
      if (!response.ok) throw new Error(body?.error ?? "Time could not be added.");
      clearPendingTimerOperation(window.sessionStorage, pendingOperation.storageKey);
      setTimerNotice(body?.warning ?? body?.schedulerWarning ?? "More time added.");
      await loadScheduleSnapshot();
      window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
    } catch (error) {
      setTimerNotice(error instanceof Error ? error.message : "Time could not be added.");
    } finally {
      setTimerRequestTaskId(null);
    }
  }

  function handleBeginCorrectSession(session: TaskWorkSession) {
    if (timerRequestTaskId) return;
    setDeletingSessionId(null);
    setSessionActionError("");
    setCorrectingSessionId(session.id);
    setCorrectingMinutes(String(Math.max(1, Math.round(session.workedSeconds / 60))));
    setCorrectionReason("Corrected work time");
  }

  function handleCancelCorrectSession() {
    setCorrectingSessionId(null);
    setCorrectingMinutes("");
    setCorrectionReason("Corrected work time");
    setSessionActionError("");
  }

  async function handleSaveCorrectedSession(session: TaskWorkSession) {
    if (timerRequestTaskId) return;
    const minutes = Math.round(Number(correctingMinutes));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
      setSessionActionError("Enter a number from 1 to 1440 minutes.");
      return;
    }
    const reason = correctionReason.trim();
    if (!reason) {
      setSessionActionError("Add a short reason for this correction.");
      return;
    }
    const started = new Date(session.startedAt).getTime();
    if (!Number.isFinite(started)) {
      setSessionActionError("This session has an invalid start time.");
      return;
    }
    setSessionActionError("");
    setTimerRequestTaskId(session.taskId);
    try {
      const response = await fetch(getAppPath(`/api/timer/sessions/${encodeURIComponent(session.id)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startedAt: session.startedAt, stoppedAt: new Date(started + minutes * 60_000).toISOString(), reason }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; warning?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The session could not be corrected.");
      handleCancelCorrectSession();
      setTimerNotice(body?.warning ?? "Session corrected and recorded.");
      await loadScheduleSnapshot();
      window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
    } catch (error) {
      setSessionActionError(error instanceof Error ? error.message : "The session could not be corrected.");
    } finally {
      setTimerRequestTaskId(null);
    }
  }

  function handleRequestDeleteSession(session: TaskWorkSession) {
    if (timerRequestTaskId) return;
    setCorrectingSessionId(null);
    setSessionActionError("");
    setDeletingSessionId(session.id);
  }

  function handleCancelDeleteSession() {
    setDeletingSessionId(null);
    setSessionActionError("");
  }

  async function handleDeleteSession(session: TaskWorkSession) {
    if (timerRequestTaskId) return;
    setSessionActionError("");
    setTimerRequestTaskId(session.taskId);
    try {
      const response = await fetch(getAppPath(`/api/timer/sessions/${encodeURIComponent(session.id)}`), { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { error?: string; warning?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The work entry could not be removed.");
      setDeletingSessionId(null);
      setTimerNotice(body?.warning ?? "Work entry removed.");
      await loadScheduleSnapshot();
      window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
    } catch (error) {
      setSessionActionError(error instanceof Error ? error.message : "The work entry could not be removed.");
    } finally {
      setTimerRequestTaskId(null);
    }
  }

  async function handleRescheduleMissed(blockId: string) {
    try {
      const response = await fetch(getAppPath(`/api/timer/missed/${encodeURIComponent(blockId)}`), { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "The missed time could not be rescheduled.");
      await loadScheduleSnapshot();
      window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
    } catch (error) {
      setTimerNotice(error instanceof Error ? error.message : "The missed time will be rescheduled on the next repair pass.");
    }
  }

  function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTaskTitle.trim();

    if (!title) {
      setTaskComposerError("Enter a task title.");
      return;
    }
    if (title.length > MAX_TASK_TITLE_LENGTH) {
      setTaskComposerError(`Keep the task title under ${MAX_TASK_TITLE_LENGTH} characters.`);
      return;
    }

    if (newTaskStartDate && newTaskDeadline && newTaskStartDate > newTaskDeadline) {
      setTaskComposerError("The start date must be on or before the due date.");
      return;
    }
    if (newTaskDuration.trim() && parseDuration(newTaskDuration) === null) {
      setTaskComposerError(`Duration must be between 1 and ${MAX_TASK_DURATION_MINUTES.toLocaleString()} minutes.`);
      return;
    }
    const selectedSpace = spaces.find((space) => space.id === newTaskSpaceId && space.status === "active");
    if (!selectedSpace) {
      setTaskComposerError(spaces.length === 0 ? "Add a Google Calendar in Settings before adding a task." : "Choose a Space for this task.");
      return;
    }
    const selectedSubSpace = selectedSpace.subSpaces.find((subSpace) => subSpace.id === newTaskSubSpaceId && subSpace.status === "active");
    setTaskComposerError("");

    const newTask: Task = {
      id: createTaskId(),
      title,
      spaceId: selectedSpace.id,
      subSpaceId: selectedSubSpace?.id ?? null,
      duration: parseDuration(newTaskDuration),
      startDate: newTaskStartDate || null,
      deadline: newTaskDeadline || null,
      priority: newTaskPriority,
      status: "open",
      autoSchedule: true,
      minBlockMinutes: null,
      maxBlockMinutes: null,
      calendarVisibility: null,
      calendarTransparency: null,
    };

    setTasks((currentTasks) => {
      const nextTask = currentTasks.some((task) => task.status === "focus")
        ? newTask
        : { ...newTask, status: "focus" as const };
      return [nextTask, ...currentTasks];
    });
    setNewTaskTitle("");
    setNewTaskDuration("");
    setNewTaskStartDate("");
    setNewTaskDeadline("");
    setNewTaskPriority("normal");
    setNewTaskSubSpaceId("");
    try { window.localStorage.setItem(`heavyuser:last-space:${authUserId}`, selectedSpace.id); } catch { /* best effort */ }
    setTaskComposerError("");
    newTaskInputRef.current?.focus();
  }

  function resetNewTaskDraft() {
    setNewTaskTitle("");
    setNewTaskDuration("");
    setNewTaskStartDate("");
    setNewTaskDeadline("");
    setNewTaskPriority("normal");
    setNewTaskSubSpaceId("");
    setTaskComposerError("");
  }

  function handleCloseTaskComposer() {
    resetNewTaskDraft();
    setIsAdding(false);
  }

  async function handleToggleTask(taskId: string) {
    const toggledTask = tasks.find((task) => task.id === taskId);
    if (toggledTask && toggledTask.status !== "done" && activeTimer?.session.taskId === taskId) {
      await handleStopTimer({ complete: true });
      return;
    }
    setTasks((currentTasks) => {
      const currentTask = currentTasks.find((task) => task.id === taskId);
      if (!currentTask) {
        return currentTasks;
      }

      const nextFocusId =
        currentTask.status === "focus"
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

      if (currentTask.status !== "done") {
        const completedTask = updatedTasks.find((task) => task.id === taskId);
        const remainingTasks = updatedTasks.filter((task) => task.id !== taskId);
        return completedTask ? [...remainingTasks, completedTask] : updatedTasks;
      }

      return updatedTasks;
    });
  }

  function seedEditingValues(task: Task) {
    setEditingTitle(task.title);
    setEditingDuration(task.duration === null ? "" : String(task.duration));
    setEditingStartDate(task.startDate ?? "");
    setEditingDeadline(task.deadline ?? "");
    setEditingPriority(task.priority);
    setEditingSpaceId(task.spaceId ?? spaces.find((space) => space.status === "active")?.id ?? "");
    setEditingSubSpaceId(task.subSpaceId ?? "");
    setEditingError("");
    setEditingMinBlockMinutes(task.minBlockMinutes === null ? "" : String(task.minBlockMinutes));
    setEditingMaxBlockMinutes(task.maxBlockMinutes === null ? "" : String(task.maxBlockMinutes));
    setEditingCalendarVisibility(task.calendarVisibility);
    setEditingCalendarTransparency(task.calendarTransparency);
  }

  function handleStartEditing(task: Task) {
    editDialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsAdding(false);
    setEditingId(task.id);
    setLoggingWorkTaskId(null);
    setLoggingWorkMinutes("30");
    setInlineEdit(null);
    setPriorityMenuTaskId(null);
    setDurationMenuTaskId(null);
    setDueDateMenuTaskId(null);
    seedEditingValues(task);
  }

  function handleStartInlineEditing(task: Task, field: InlineEditField) {
    setTaskActionError("");
    setIsAdding(false);
    setEditingId(null);
    setInlineEdit({ taskId: task.id, field });
    setPriorityMenuTaskId(null);
    setDurationMenuTaskId(null);
    setDueDateMenuTaskId(null);
    seedEditingValues(task);
  }

  function handleStartPriorityEditing(task: Task) {
    setTaskActionError("");
    setIsAdding(false);
    setEditingId(null);
    setInlineEdit(null);
    setDurationMenuTaskId(null);
    setDueDateMenuTaskId(null);
    setPriorityMenuTaskId((currentTaskId) => (currentTaskId === task.id ? null : task.id));
  }

  function handleStartDurationEditing(task: Task) {
    setTaskActionError("");
    setIsAdding(false);
    const parts = getDurationParts(task.duration);
    setEditingId(null);
    setInlineEdit(null);
    setPriorityMenuTaskId(null);
    setDueDateMenuTaskId(null);
    setDurationHours(parts && parts.hours > 0 ? String(parts.hours) : "");
    setDurationMinutes(parts ? String(parts.minutes) : "");
    setDurationMenuTaskId((currentTaskId) => (currentTaskId === task.id ? null : task.id));
  }

  function handleStartDueDateEditing(task: Task) {
    setTaskActionError("");
    setIsAdding(false);
    setEditingId(null);
    setInlineEdit(null);
    setPriorityMenuTaskId(null);
    setDurationMenuTaskId(null);
    setDueDateDraft(task.deadline ?? "");
    setDueDateMenuTaskId((currentTaskId) => (currentTaskId === task.id ? null : task.id));
  }

  function handleCommitInlineEdit(taskId: string, field: InlineEditField, rawValue: string) {
    if (inlineEdit?.taskId !== taskId || inlineEdit.field !== field) {
      return;
    }

    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      setInlineEdit(null);
      return;
    }

    if (field === "title") {
      const title = rawValue.trim();
      if (title.length > MAX_TASK_TITLE_LENGTH) {
        setTaskActionError(`Keep the task title under ${MAX_TASK_TITLE_LENGTH} characters.`);
        return;
      }
      if (title) {
        setTaskActionError("");
        setTasks((currentTasks) =>
          currentTasks.map((currentTask) => (currentTask.id === taskId ? { ...currentTask, title } : currentTask)),
        );
      }
    }

    setInlineEdit(null);
  }

  function handleInlineEditKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, taskId: string) {
    if (event.key === "Escape") {
      event.preventDefault();
      setInlineEdit(null);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleCommitInlineEdit(taskId, "title", event.currentTarget.value);
    }
  }

  function handlePriorityChange(taskId: string, priority: Priority) {
    const returnFocus = priorityMenuRef.current?.querySelector<HTMLElement>("[aria-haspopup='menu']") ?? null;
    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? { ...task, priority } : task)),
    );
    setPriorityMenuTaskId(null);
    window.requestAnimationFrame(() => returnFocus?.focus());
  }

  function handleDurationChange(taskId: string, duration: number | null) {
    if (duration !== null && (!Number.isFinite(duration) || duration < 1 || duration > MAX_TASK_DURATION_MINUTES)) {
      setTaskActionError(`Duration must be between 1 and ${MAX_TASK_DURATION_MINUTES.toLocaleString()} minutes.`);
      return;
    }
    setTaskActionError("");
    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? { ...task, duration } : task)),
    );
    setDurationMenuTaskId(null);
  }

  function handleCustomDurationSave(taskId: string) {
    const rawHours = durationHours.trim() ? Number(durationHours) : 0;
    const rawMinutes = durationMinutes.trim() ? Number(durationMinutes) : 0;
    if (!Number.isInteger(rawHours) || !Number.isInteger(rawMinutes) || rawHours < 0 || rawMinutes < 0 || rawMinutes > 59) {
      setTaskActionError("Enter whole hours and 0–59 minutes.");
      return;
    }
    const hours = rawHours;
    const minutes = rawMinutes;
    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes > MAX_TASK_DURATION_MINUTES) {
      setTaskActionError(`Duration cannot exceed ${MAX_TASK_DURATION_MINUTES.toLocaleString()} minutes.`);
      return;
    }
    handleDurationChange(taskId, totalMinutes > 0 ? totalMinutes : null);
  }

  function handleDueDateChange(taskId: string, deadline: string | null) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (deadline && task?.startDate && task.startDate > deadline) {
      setTaskActionError("The due date must be on or after the task start date.");
      return;
    }
    setTaskActionError("");
    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? { ...task, deadline } : task)),
    );
    setDueDateMenuTaskId(null);
  }

  function handleCancelEditing() {
    setEditingId(null);
    setLoggingWorkTaskId(null);
    setLoggingWorkMinutes("30");
    setInlineEdit(null);
    setPriorityMenuTaskId(null);
    setDurationMenuTaskId(null);
    setDueDateMenuTaskId(null);
    setEditingTitle("");
    setEditingDuration("");
    setEditingStartDate("");
    setEditingDeadline("");
    setEditingPriority("normal");
    setEditingSpaceId("");
    setEditingSubSpaceId("");
    setEditingError("");
    setEditingMinBlockMinutes("");
    setEditingMaxBlockMinutes("");
    setEditingCalendarVisibility(null);
    setEditingCalendarTransparency(null);
    setCorrectingSessionId(null);
    setCorrectingMinutes("");
    setCorrectionReason("Corrected work time");
    setDeletingSessionId(null);
    setSessionActionError("");
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    const title = editingTitle.trim();

    if (!title) {
      setEditingError("Enter a task title.");
      return;
    }
    if (title.length > MAX_TASK_TITLE_LENGTH) {
      setEditingError(`Keep the task title under ${MAX_TASK_TITLE_LENGTH} characters.`);
      return;
    }

    if (editingStartDate && editingDeadline && editingStartDate > editingDeadline) {
      setEditingError("The start date must be on or before the due date.");
      return;
    }

    if (editingDuration.trim() && parseDuration(editingDuration) === null) {
      setEditingError(`Duration must be between 1 and ${MAX_TASK_DURATION_MINUTES.toLocaleString()} minutes.`);
      return;
    }

    const minBlockMinutes = parseDuration(editingMinBlockMinutes);
    const maxBlockMinutes = parseDuration(editingMaxBlockMinutes);
    if ((editingMinBlockMinutes.trim() && minBlockMinutes === null) || (editingMaxBlockMinutes.trim() && maxBlockMinutes === null)) {
      setEditingError(`Block overrides must be between 5 and ${MAX_TASK_DURATION_MINUTES.toLocaleString()} minutes.`);
      return;
    }
    if ((minBlockMinutes !== null && minBlockMinutes < 5) || (maxBlockMinutes !== null && maxBlockMinutes < 5)) {
      setEditingError("Block overrides must be at least 5 minutes.");
      return;
    }
    if (minBlockMinutes !== null && maxBlockMinutes !== null && minBlockMinutes > maxBlockMinutes) {
      setEditingError("The minimum block must be shorter than the maximum block.");
      return;
    }

    const currentTask = tasks.find((task) => task.id === taskId);
    const selectedSpace = spaces.find((space) => space.id === editingSpaceId);
    const canKeepArchivedSpace = Boolean(
      currentTask?.status === "done"
      && currentTask.spaceId === selectedSpace?.id
      && selectedSpace?.status === "archived",
    );
    if (!selectedSpace || (selectedSpace.status !== "active" && !canKeepArchivedSpace)) {
      setEditingError("Choose an active Space for this task.");
      return;
    }
    const selectedSubSpace = selectedSpace.subSpaces.find((subSpace) => (
      subSpace.id === editingSubSpaceId
      && (subSpace.status === "active" || (canKeepArchivedSpace && subSpace.id === currentTask?.subSpaceId))
    ));

    setEditingError("");

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title,
              spaceId: selectedSpace.id,
              subSpaceId: selectedSubSpace?.id ?? null,
              duration: parseDuration(editingDuration),
              startDate: editingStartDate || null,
              deadline: editingDeadline || null,
              priority: editingPriority,
              autoSchedule: true,
              minBlockMinutes,
              maxBlockMinutes,
              calendarVisibility: editingCalendarVisibility,
              calendarTransparency: editingCalendarTransparency,
            }
          : task,
      ),
    );
    try { window.localStorage.setItem(`heavyuser:last-space:${authUserId}`, selectedSpace.id); } catch { /* best effort */ }
    handleCancelEditing();
  }

  async function handleDeleteTask(taskId: string) {
    if (activeTimer?.session.taskId === taskId) {
      const stopped = await handleStopTimer();
      if (!stopped) return;
    }
    if (supabaseClient && authUserId) {
      setPendingRemoteDeletes((currentIds) =>
        currentIds.includes(taskId) ? currentIds : [...currentIds, taskId],
      );
    }

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
      const bucketTasks = currentTasks.filter(
        (task) =>
          matchesTaskBucket(task, activeBucket, getAppToday()) &&
          (showCompletedTasks || task.status !== "done"),
      );
      const visibleTasks = isCustomOrder ? [...bucketTasks] : sortTasks(bucketTasks);
      const currentIndex = visibleTasks.findIndex((task) => task.id === taskId);
      const targetIndex = visibleTasks.findIndex((task) => task.id === targetId);

      if (currentIndex < 0 || targetIndex < 0) {
        return currentTasks;
      }

      const reorderedTasks = [...visibleTasks];
      const [movedTask] = reorderedTasks.splice(currentIndex, 1);
      const nextTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
      reorderedTasks.splice(nextTargetIndex, 0, movedTask);
      return replaceBucketOrder(currentTasks, reorderedTasks);
    });
    enableCustomTaskOrder();
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
      const bucketTasks = currentTasks.filter(
        (task) =>
          matchesTaskBucket(task, activeBucket, getAppToday()) &&
          (showCompletedTasks || task.status !== "done"),
      );
      const visibleTasks = isCustomOrder ? [...bucketTasks] : sortTasks(bucketTasks);
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
      return replaceBucketOrder(currentTasks, reorderedTasks);
    });
    enableCustomTaskOrder();
  }

  function enableCustomTaskOrder() {
    setIsCustomOrder(true);
    if (settings.customTaskOrder || customOrderSaveInFlightRef.current) {
      return;
    }

    customOrderSaveInFlightRef.current = true;
    void updateSettings({ ...settings, customTaskOrder: true })
      .then((result) => {
        if (!result.ok) {
          setTaskActionError(`${result.message} Your order is kept on this screen, but may reset on another device.`);
        }
      })
      .finally(() => {
        customOrderSaveInFlightRef.current = false;
      });
  }

  const logicalToday = getAppToday();
  const taskCounts = taskBucketOptions.reduce<Record<TaskBucket, number>>(
    (counts, option) => {
      if (option.value === "all") {
        counts.all = tasks.filter((task) => task.status !== "done").length;
        return counts;
      }

      counts[option.value] = tasks.filter(
        (task) =>
          getTaskBucket(task, logicalToday) === option.value &&
          task.status !== "done",
      ).length;
      return counts;
    },
    { all: 0, backlog: 0, today: 0, upcoming: 0 },
  );
  const activeBucketTasks = tasks.filter(
    (task) =>
      matchesTaskBucket(task, activeBucket, logicalToday) &&
      (showCompletedTasks || task.status !== "done"),
  );
  const visibleTasks = isCustomOrder ? activeBucketTasks : sortTasks(activeBucketTasks);
  const visibleTaskGroups: ReadonlyArray<UpcomingTaskGroup> =
    activeBucket === "upcoming"
      ? groupUpcomingTasks(visibleTasks, logicalToday)
      : [{ id: "all", label: null, helper: "", dateLabel: "", tasks: visibleTasks }];
  const dueDatePresets = getDueDatePresets(logicalToday);
  const editingTask = editingId ? tasks.find((task) => task.id === editingId) ?? null : null;
  const editingScheduleStatus = editingTask ? scheduleStatuses[editingTask.id] : undefined;
  const editingScheduleBlocks = editingTask ? scheduleBlocks[editingTask.id] ?? [] : [];
  const editingWorkSummary = editingTask ? taskWorkSummaries[editingTask.id] : undefined;
  const editingMissedBlocks = editingTask ? missedBlocks.filter((block) => block.taskId === editingTask.id) : [];
  const editingScheduleLabel = editingTask ? getScheduleLabel(editingTask, editingScheduleStatus) : null;
  const isLoggingWork = Boolean(editingTask && loggingWorkTaskId === editingTask.id);
  const liveTaskIds = new Set(tasks.map((task) => task.id));
  const deletedTaskWorkSummaries = Object.values(taskWorkSummaries)
    .filter((summary) => !liveTaskIds.has(summary.taskId) && summary.sessions.some((session) => session.state !== "cancelled"))
    .sort((first, second) => {
      const firstLatest = Math.max(...first.sessions.map((session) => new Date(session.startedAt).getTime()).filter(Number.isFinite), 0);
      const secondLatest = Math.max(...second.sessions.map((session) => new Date(session.startedAt).getTime()).filter(Number.isFinite), 0);
      return secondLatest - firstLatest;
    });
  const headerDateTime = formatHeaderDateTime(currentDateTime, logicalToday);
  if (authStatus === "loading" || (authStatus === "signed_in" && !isHydrated)) {
    return (
      <main className="hu-auth-loading" aria-busy="true">
        <span className="hu-auth-loading-mark" aria-hidden="true" />
        Loading your workspace…
      </main>
    );
  }

  if (authStatus !== "signed_in" || !authUser) {
    return null;
  }

  return (
    <main className={`hu-shell ${activeTimer ? "has-active-timer" : ""}`}>
      <div className="hu-main">
        <header ref={topbarRef} className="hu-topbar" aria-label="Global navigation">
          <button
            aria-label="Open tasks"
            className="hu-brand-button"
            type="button"
            onClick={() => {
              setIsNotificationsOpen(false);
            }}
          >
            <Image
              alt="HeavyUser"
              className="hu-brand-logo"
              height={20}
              priority
              src={`${publicAssetPath}/heavyuser-logo.png`}
              width={155}
            />
          </button>

          <div className="hu-topbar-actions">
            <div className="hu-topbar-context" aria-label="Current date and time">
              <span className="hu-topbar-weekday">{headerDateTime?.weekday ?? "Today"}</span>
              <time
                className="hu-topbar-date"
                dateTime={currentDateTime === null ? undefined : new Date(currentDateTime).toISOString()}
              >
                {headerDateTime ? `${headerDateTime.date} · ${headerDateTime.time}` : "—"}
              </time>
            </div>

            <div className="hu-popover-anchor">
              <button
                aria-expanded={isNotificationsOpen}
                aria-label="Notifications"
                className="hu-topbar-button"
                type="button"
                onClick={() => {
                  setIsNotificationsOpen((current) => !current);
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

            <ProfileMenu
              onSignedOut={() => {
                setRemoteSyncReady(false);
                setIsHydrated(false);
                setPendingRemoteDeletes([]);
                setScheduleStatuses({});
                setScheduleBlocks({});
                setActiveTimer(null);
                setTimerElapsedSeconds(0);
                setTaskWorkSummaries({});
                setMissedBlocks([]);
                setTimerAlerts([]);
                setSchedulerError("");
                setTasks([]);
              }}
            />
          </div>
        </header>

        {activeTimer ? (
          <div className="hu-active-timer-bar" aria-live="polite">
            <div className="hu-active-timer-copy">
              <span className="hu-active-timer-pulse" aria-hidden="true" />
              <span className="hu-active-timer-label">Working now</span>
              <strong>{tasks.find((task) => task.id === activeTimer.session.taskId)?.title ?? "Task"}</strong>
              <time dateTime={activeTimer.session.startedAt}>{formatElapsedSeconds(timerElapsedSeconds)}</time>
            </div>
            <div className="hu-active-timer-actions">
              <button className="hu-timer-secondary-button" type="button" onClick={handleAddTime}>
                <PlusCircle aria-hidden="true" size={14} />
                Add time
              </button>
              <button className="hu-timer-stop-button" type="button" onClick={() => void handleStopTimer()}>
                <Square aria-hidden="true" size={13} fill="currentColor" />
                Stop
              </button>
            </div>
          </div>
        ) : null}
        {timerNotice ? <p className="hu-timer-notice" role="status">{timerNotice}</p> : null}
        {taskSyncNotice ? <p className="hu-timer-notice is-warning" role="status">{taskSyncNotice}</p> : null}
        {taskActionError ? <p className="hu-timer-notice is-warning" role="alert">{taskActionError}</p> : null}
        {timerAlerts[0] ? <p className="hu-timer-notice is-warning" role="alert">{timerAlerts[0].message} Review the task history before starting again.</p> : null}

        <div className="hu-content">
          <div className="hu-workspace">
            <section className="hu-region hu-task-region" aria-labelledby="tasks-title">
              <div className="hu-pane-toolbar">
                <h1 className="sr-only" id="tasks-title">
                  Tasks
                </h1>
                <div className="hu-pane-toolbar-content">
                  <div className="hu-task-tabs" role="tablist" aria-label="Task views">
                    {taskBucketOptions.map((option) => (
                      <button
                        aria-controls="task-list-panel"
                        aria-selected={activeBucket === option.value}
                        className={`hu-task-tab ${activeBucket === option.value ? "is-active" : ""} ${option.value === "all" ? "is-icon-only" : ""}`}
                        id={`task-tab-${option.value}`}
                        key={option.value}
                        role="tab"
                        title={option.label}
                        type="button"
                        onClick={() => {
                          setActiveBucket(option.value);
                        }}
                      >
                        <option.icon aria-hidden="true" size={13} />
                        {option.value === "all" ? <span className="sr-only">{option.label}</span> : <span>{option.label}</span>}
                        {option.value !== "all" ? <span className="hu-task-tab-count">{taskCounts[option.value]}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="hu-pane-toolbar-actions">
                  <label className="hu-task-completed-filter">
                    <input
                      aria-label="Show completed tasks"
                      checked={showCompletedTasks}
                      className="hu-task-filter-checkbox"
                      type="checkbox"
                      onChange={(event) => setShowCompletedTasks(event.target.checked)}
                    />
                    <span>Completed</span>
                  </label>
                  <button
                    className="hu-add-button"
                    type="button"
                    onClick={() => {
                      if (isAdding) {
                        handleCloseTaskComposer();
                        return;
                      }

                      handleCancelEditing();
                      setIsAdding(true);
                    }}
                  >
                    <Plus aria-hidden="true" size={15} />
                    {isAdding ? "Close" : "Add task"}
                  </button>
                </div>
              </div>

              {isAdding ? (
                <form aria-label="Add task" className="hu-task-composer" onSubmit={handleAddTask}>
                  <div className="hu-composer-heading">
                    <div>
                      <span className="hu-composer-kicker">Capture</span>
                      <strong>Start with the next action</strong>
                    </div>
                    <span className="hu-composer-hint">Add details only when they help you place the work.</span>
                  </div>

                  <div className="hu-composer-main-field">
                    <label className="hu-field-label" htmlFor="new-task-title">
                      Task title
                    </label>
                    <input
                      autoFocus
                      aria-keyshortcuts="Q"
                      className="hu-task-input"
                      id="new-task-title"
                      maxLength={MAX_TASK_TITLE_LENGTH}
                      minLength={1}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      placeholder="What needs doing?"
                      ref={newTaskInputRef}
                      required
                      title="Press Q to focus this field"
                      value={newTaskTitle}
                    />
                  </div>

                  <div className="hu-composer-details">
                    <span className="hu-composer-details-label">Details</span>
                    <div className="hu-task-options" id="new-task-options">
                    <label className="hu-field">
                      <span className="hu-field-label">Duration</span>
                      <span className="hu-duration-input-wrap">
                        <input
                          aria-label="Task duration in minutes"
                          className="hu-task-input hu-duration-input"
                          inputMode="numeric"
                          min="5"
                          max={MAX_TASK_DURATION_MINUTES}
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
                      <span className="hu-field-label">Start date</span>
                      <DateField
                        ariaLabel="Task start date"
                        className="hu-task-input"
                        value={newTaskStartDate}
                        onChange={setNewTaskStartDate}
                      />
                    </label>
                    <label className="hu-field">
                      <span className="hu-field-label">Due date</span>
                      <DateField
                        ariaLabel="Task due date"
                        className="hu-task-input"
                        value={newTaskDeadline}
                        onChange={setNewTaskDeadline}
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
                    <label className="hu-field">
                      <span className="hu-field-label">Space <span aria-hidden="true">*</span></span>
                      <select
                        aria-label="Task Space"
                        className="hu-task-input"
                        required
                        value={newTaskSpaceId}
                        onChange={(event) => { setNewTaskSpaceId(event.target.value); setNewTaskSubSpaceId(""); }}
                      >
                        <option value="">{spaces.length === 0 ? "Add a calendar first" : "Choose a Space"}</option>
                        {spaces.filter((space) => space.status === "active").map((space) => (
                          <option key={space.id} value={space.id}>{space.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="hu-field">
                      <span className="hu-field-label">Sub-space</span>
                      <select
                        aria-label="Task Sub-space"
                        className="hu-task-input"
                        disabled={!newTaskSpaceId}
                        value={newTaskSubSpaceId}
                        onChange={(event) => setNewTaskSubSpaceId(event.target.value)}
                      >
                        <option value="">Space only</option>
                        {(spaces.find((space) => space.id === newTaskSpaceId)?.subSpaces ?? []).filter((subSpace) => subSpace.status === "active").map((subSpace) => (
                          <option key={subSpace.id} value={subSpace.id}>{subSpace.name}</option>
                        ))}
                      </select>
                    </label>
                    </div>
                  </div>
                  {spaceError ? <p className="hu-form-error" role="alert">{spaceError}</p> : null}
                  <div className="hu-form-actions hu-composer-actions">
                    {taskComposerError ? <p className="hu-form-error" role="alert">{taskComposerError}</p> : null}
                    <span className="hu-composer-submit-hint"><kbd>Enter</kbd> to add · <kbd>Esc</kbd> to close</span>
                    <button className="hu-form-button is-primary" type="submit">
                      Add task
                    </button>
                  </div>
                </form>
              ) : null}

              <div
                aria-labelledby={`task-tab-${activeBucket}`}
                className="hu-task-list"
                id="task-list-panel"
                role="tabpanel"
              >
                {visibleTasks.length === 0 ? (
                  <div className="hu-empty-state">
                    <p>No tasks here yet.</p>
                    <button className="hu-empty-action" type="button" onClick={() => setIsAdding(true)}>
                      <Plus aria-hidden="true" size={14} />
                      Add task
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="hu-task-table-head" role="group" aria-label="Task table columns">
                      <span aria-hidden="true" />
                      <span
                        className="hu-table-head-icon-only"
                        title="Priority"
                      >
                        <Flag aria-hidden="true" size={13} />
                      </span>
                      <span>
                        <ListTodo aria-hidden="true" size={13} />
                        <span className="hu-table-head-label">Task</span>
                      </span>
                      <span aria-hidden="true" />
                      <span
                        className="hu-table-head-icon-only"
                        title="Duration"
                      >
                        <Clock3 aria-hidden="true" size={13} />
                      </span>
                      <span
                        className="hu-table-head-icon-only"
                        title="Due date"
                      >
                        <CalendarDays aria-hidden="true" size={13} />
                      </span>
                    </div>
                    {visibleTaskGroups.map((group) => {
                      const isCollapsed =
                        group.id !== "all" && collapsedUpcomingGroupIds.includes(group.id);

                      return (
                        <div className={`hu-task-group ${group.id !== "all" ? "is-upcoming-group" : ""}`} key={group.id}>
                          {group.label ? (
                            <div className="hu-task-group-heading">
                              <Button
                                aria-expanded={!isCollapsed}
                                className="hu-task-group-toggle"
                                size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  if (group.id === "all") {
                                    return;
                                  }

                                  const groupId: UpcomingGroupId = group.id;
                                  setCollapsedUpcomingGroupIds((current) =>
                                    current.includes(groupId)
                                      ? current.filter((id) => id !== groupId)
                                      : [...current, groupId],
                                  );
                                }}
                              >
                                <ChevronDown
                                  aria-hidden="true"
                                  className={isCollapsed ? "is-collapsed" : ""}
                                  size={15}
                                />
                                <span>{group.label}</span>
                                <span className="hu-task-group-date">{group.dateLabel}</span>
                              </Button>
                              <span className="hu-task-group-helper">{group.helper}</span>
                              <span className="hu-task-group-count">{group.tasks.length}</span>
                            </div>
                          ) : null}
                          {!isCollapsed && group.tasks.map((task) => {
                            const isDone = task.status === "done";
                            const isFocus = task.status === "focus";
                            const isOverdue = isDeadlineOverdue(task.deadline, task.status, logicalToday);
                            const durationParts = getDurationParts(task.duration);
                            const hasDuration = durationParts !== null;
                            const dueDateLabel = formatTaskDueDate(task.deadline);
                            const activeInlineField = inlineEdit?.taskId === task.id ? inlineEdit.field : null;
                            const isPriorityMenuOpen = priorityMenuTaskId === task.id;
                            const isDurationMenuOpen = durationMenuTaskId === task.id;
                            const isDueDateMenuOpen = dueDateMenuTaskId === task.id;
                            const hasTaskPopover = isPriorityMenuOpen || isDurationMenuOpen || isDueDateMenuOpen;
                            const taskSpace = spaces.find((space) => space.id === task.spaceId);
                            const taskSubSpace = taskSpace?.subSpaces.find((subSpace) => subSpace.id === task.subSpaceId);
                            const isActiveTask = activeTimer?.session.taskId === task.id;
                            const workSummary = taskWorkSummaries[task.id];

                            return (
                              <article
                                aria-label={`${task.title}${isOverdue ? ", overdue" : ""}`}
                                className={`hu-task-row ${isFocus ? "is-focus" : ""} ${
                                  isDone ? "is-done-row" : ""
                                } ${draggingId === task.id ? "is-dragging" : ""} ${
                                  dragOverId === task.id ? "is-drag-over" : ""
                                } ${hasTaskPopover ? "is-task-popover-open" : ""}`}
                                draggable={!editingTask && !activeInlineField && !hasTaskPopover}
                                aria-current={isFocus ? "true" : undefined}
                                key={task.id}
                                tabIndex={editingTask || activeInlineField || hasTaskPopover ? -1 : 0}
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

                                <div className="hu-task-priority-cell" ref={isPriorityMenuOpen ? priorityMenuRef : undefined}>
                                  <button
                                    aria-expanded={isPriorityMenuOpen}
                                    aria-haspopup="menu"
                                    aria-label={`Priority: ${priorityLabels[task.priority]}. Change priority`}
                                    className={`hu-inline-edit-trigger hu-task-priority-trigger is-${task.priority}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleStartPriorityEditing(task);
                                    }}
                                    title="Change priority"
                                  >
                                    <PriorityIcon priority={task.priority} />
                                  </button>
                                  {isPriorityMenuOpen ? (
                                    <div
                                      aria-label={`Change priority for ${task.title}`}
                                      className="hu-priority-menu"
                                      role="menu"
                                      onKeyDown={handleMenuArrowNavigation}
                                    >
                                      {priorityOptions.map((option) => {
                                        const optionPriority = option.value;
                                        const isSelected = task.priority === optionPriority;

                                        return (
                                          <button
                                            aria-checked={isSelected}
                                            className={`hu-priority-option ${isSelected ? "is-selected" : ""}`}
                                            key={optionPriority}
                                            role="menuitemradio"
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handlePriorityChange(task.id, optionPriority);
                                            }}
                                          >
                                            <span className={`hu-priority-option-icon is-${optionPriority}`}>
                                              <PriorityIcon priority={optionPriority} />
                                            </span>
                                            <span>{priorityLabels[optionPriority]}</span>
                                            {isSelected ? <Check aria-hidden="true" size={13} /> : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="hu-task-title-cell">
                                  {activeInlineField === "title" ? (
                                    <input
                                      aria-label={`Edit title for ${task.title}`}
                                      autoFocus
                                      className="hu-inline-edit-input hu-inline-title-input"
                                      minLength={1}
                                      maxLength={MAX_TASK_TITLE_LENGTH}
                                      value={editingTitle}
                                      onBlur={(event) =>
                                        handleCommitInlineEdit(task.id, "title", event.currentTarget.value)
                                      }
                                      onChange={(event) => setEditingTitle(event.target.value)}
                                      onKeyDown={(event) => handleInlineEditKeyDown(event, task.id)}
                                    />
                                  ) : (
                                    <button
                                      aria-label={`Edit title for ${task.title}${isOverdue ? " (overdue)" : ""}`}
                                      className="hu-inline-edit-trigger hu-task-title-trigger"
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleStartInlineEditing(task, "title");
                                      }}
                                      title="Edit title"
                                    >
                                      <span className="hu-task-title">{task.title}</span>
                                      <span className="hu-task-space-label" title={taskSpace ? `Space: ${taskSpace.name}` : "Space not assigned"}>
                                        {taskSubSpace?.name ?? taskSpace?.name ?? "No Space"}
                                      </span>
                                      {workSummary && workSummary.workedMinutes > 0 ? (
                                        <span className="hu-task-work-label">
                                          {workSummary.workedMinutes}m worked{workSummary.remainingMinutes === null ? "" : ` · ${workSummary.remainingMinutes}m left`}
                                        </span>
                                      ) : null}
                                      {isOverdue ? (
                                        <CircleAlert
                                          aria-hidden="true"
                                          className="hu-overdue-indicator"
                                          size={13}
                                          strokeWidth={2.5}
                                        />
                                      ) : null}
                                    </button>
                                  )}
                                </div>

                                <div className="hu-task-controls">
                                  <button
                                    aria-label={isActiveTask ? `Stop timer for ${task.title}` : `Start timer for ${task.title}`}
                                    className={`hu-icon-button hu-task-timer-button ${isActiveTask ? "is-running" : ""}`}
                                    disabled={Boolean(timerRequestTaskId)}
                                    type="button"
                                    onClick={() => {
                                      if (isActiveTask) {
                                        void handleStopTimer();
                                      } else {
                                        void handleStartTimer(task.id);
                                      }
                                    }}
                                    title={isActiveTask ? "Stop timer" : "Start timer"}
                                  >
                                    {isActiveTask ? <Square aria-hidden="true" fill="currentColor" size={13} /> : <Play aria-hidden="true" size={14} />}
                                  </button>
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
                                    onClick={() => void handleDeleteTask(task.id)}
                                    title="Delete task"
                                  >
                                    <Trash2 aria-hidden="true" />
                                  </button>
                                </div>

                                <div
                                  aria-label={hasDuration ? `Duration: ${formatDuration(task.duration)}` : "Duration not set"}
                                  className="hu-task-time"
                                  ref={isDurationMenuOpen ? durationMenuRef : undefined}
                                  title={hasDuration ? `Duration: ${formatDuration(task.duration)}` : "Edit duration"}
                                >
                                  <button
                                    aria-expanded={isDurationMenuOpen}
                                    aria-haspopup="dialog"
                                    aria-label={hasDuration ? `Edit duration: ${formatDuration(task.duration)}` : "Add duration"}
                                    className="hu-inline-edit-trigger hu-task-time-trigger"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleStartDurationEditing(task);
                                    }}
                                    title="Edit duration"
                                  >
                                    {durationParts ? (
                                      <span className="hu-duration-value">
                                        <span className="hu-duration-hours">
                                          {durationParts.hours > 0
                                            ? `${String(durationParts.hours).padStart(2, "0")}h`
                                            : null}
                                        </span>
                                        <span className="hu-duration-minutes">
                                          {String(durationParts.minutes).padStart(2, "0")}m
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="hu-inline-empty-value">—</span>
                                    )}
                                  </button>
                                  {isDurationMenuOpen ? (
                                    <div
                                      aria-label={`Set duration for ${task.title}`}
                                      className="hu-duration-menu"
                                      role="dialog"
                                    >
                                      <span className="hu-popover-kicker">Quick duration</span>
                                      <div className="hu-duration-presets">
                                        {durationPresets.map((preset) => (
                                          <button
                                            aria-pressed={task.duration === preset.minutes}
                                            className="hu-duration-preset"
                                            key={preset.minutes}
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleDurationChange(task.id, preset.minutes);
                                            }}
                                          >
                                            {preset.label}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="hu-popover-divider" role="presentation" />
                                      <span className="hu-popover-kicker">Custom</span>
                                      <div className="hu-duration-custom">
                                        <label className="hu-duration-custom-field">
                                          <span>Hours</span>
                                          <input
                                            aria-label="Hours"
                                            inputMode="numeric"
                                            max={Math.floor(MAX_TASK_DURATION_MINUTES / 60)}
                                            min="0"
                                            type="number"
                                            value={durationHours}
                                            onChange={(event) => setDurationHours(event.target.value)}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter") {
                                                event.preventDefault();
                                                handleCustomDurationSave(task.id);
                                              }
                                            }}
                                          />
                                        </label>
                                        <label className="hu-duration-custom-field">
                                          <span>Minutes</span>
                                          <input
                                            aria-label="Minutes"
                                            inputMode="numeric"
                                            max="59"
                                            min="0"
                                            type="number"
                                            value={durationMinutes}
                                            onChange={(event) => setDurationMinutes(event.target.value)}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter") {
                                                event.preventDefault();
                                                handleCustomDurationSave(task.id);
                                              }
                                            }}
                                          />
                                        </label>
                                        <button
                                          className="hu-popover-apply"
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleCustomDurationSave(task.id);
                                          }}
                                        >
                                          Apply
                                        </button>
                                      </div>
                                      <button
                                        className="hu-popover-clear"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleDurationChange(task.id, null);
                                        }}
                                      >
                                        Clear duration
                                      </button>
                                    </div>
                                  ) : null}
                                </div>

                                <div
                                  aria-label={dueDateLabel ? `Due date: ${dueDateLabel}` : "Due date not set"}
                                  className={`hu-task-due-date ${
                                    isDeadlineOverdue(task.deadline, task.status, logicalToday) ? "is-overdue" : ""
                                  }`}
                                  ref={isDueDateMenuOpen ? dueDateMenuRef : undefined}
                                  title={dueDateLabel || "Edit due date"}
                                >
                                  <button
                                    aria-expanded={isDueDateMenuOpen}
                                    aria-haspopup="dialog"
                                    aria-label={dueDateLabel ? `Edit due date: ${dueDateLabel}` : "Add due date"}
                                    className="hu-inline-edit-trigger hu-task-due-date-trigger"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleStartDueDateEditing(task);
                                    }}
                                    title="Edit due date"
                                  >
                                    {dueDateLabel || <span className="hu-inline-empty-value">—</span>}
                                  </button>
                                  {isDueDateMenuOpen ? (
                                    <div
                                      aria-label={`Set due date for ${task.title}`}
                                      className="hu-due-date-menu"
                                      role="dialog"
                                    >
                                      <span className="hu-popover-kicker">Quick date</span>
                                      <div className="hu-due-date-presets">
                                        {dueDatePresets.map((preset) => (
                                          <button
                                            aria-pressed={task.deadline === preset.value}
                                            className="hu-due-date-preset"
                                            key={preset.value}
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleDueDateChange(task.id, preset.value);
                                            }}
                                          >
                                            <span>{preset.label}</span>
                                            <small>{formatShortDate(preset.value)}</small>
                                          </button>
                                        ))}
                                      </div>
                                      <div className="hu-popover-divider" role="presentation" />
                                      <span className="hu-popover-kicker">Custom date</span>
                                      <DateField
                                        ariaLabel={`Custom due date for ${task.title}`}
                                        className="hu-edit-input hu-popover-date-input"
                                        value={dueDateDraft}
                                        onChange={setDueDateDraft}
                                      />
                                      <button
                                        className="hu-popover-apply"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleDueDateChange(task.id, dueDateDraft || null);
                                        }}
                                      >
                                        Apply date
                                      </button>
                                      <button
                                        className="hu-popover-clear"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleDueDateChange(task.id, null);
                                        }}
                                      >
                                        Clear due date
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                )}
                {deletedTaskWorkSummaries.length > 0 ? (
                  <section aria-labelledby="deleted-task-work-title" className="hu-deleted-work-panel">
                    <div>
                      <h2 id="deleted-task-work-title">Saved work from deleted tasks</h2>
                      <p>Deleting a task never deletes the time you already recorded.</p>
                    </div>
                    <div className="hu-deleted-work-list">
                      {deletedTaskWorkSummaries.map((summary) => {
                        const sessions = summary.sessions.filter((session) => session.state !== "cancelled");
                        return (
                          <details className="hu-deleted-work-item" key={summary.taskId}>
                            <summary>
                              <History aria-hidden="true" size={13} />
                              <span>Deleted task · {summary.taskId.slice(-8)}</span>
                              <strong>{summary.workedMinutes}m worked</strong>
                            </summary>
                            <div className="hu-work-session-list">
                              {sessions.slice(0, 8).map((session) => (
                                <div className="hu-work-session-item" key={session.id}>
                                  <History aria-hidden="true" size={13} />
                                  <span className="hu-work-session-copy">
                                    <strong>{session.source === "manual" ? "Logged work" : "Timer"}</strong>
                                    <time dateTime={session.startedAt}>{new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>
                                  </span>
                                  <span className="hu-work-session-minutes">{Math.max(1, Math.floor(session.workedSeconds / 60))}m</span>
                                  {session.repairNeeded ? <span className="hu-deleted-work-warning">Calendar repair pending</span> : null}
                                </div>
                              ))}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
            </section>

            <GoogleCalendarPanel
              date={logicalToday}
              settings={settings}
              tasks={tasks}
              spaces={spaces}
              scheduleBlocks={scheduleBlocks}
              activeBlockId={activeTimer?.session.blockId ?? null}
              schedulerError={schedulerError}
              onTaskDurationChange={handleDurationChange}
              onSpacesChange={applySpaces}
            />
          </div>
        </div>

        {editingTask ? (
          <div
            className="hu-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                handleCancelEditing();
              }
            }}
          >
            <form
              aria-label="Edit task"
              className="hu-task-dialog"
              ref={taskDialogRef}
              role="dialog"
              aria-modal="true"
              onSubmit={(event) => handleSaveEdit(event, editingTask.id)}
            >
              <button
                aria-label="Close edit task dialog"
                className="hu-task-dialog-close hu-icon-button"
                type="button"
                onClick={handleCancelEditing}
              >
                <X aria-hidden="true" />
              </button>

              <div className="hu-task-dialog-body">
                <div className="hu-task-dialog-column hu-task-dialog-details">
                <label className="hu-edit-field hu-dialog-title-field">
                  <span className="hu-field-label">Task</span>
                  <input
                    autoFocus
                    className="hu-edit-input"
                    maxLength={MAX_TASK_TITLE_LENGTH}
                    minLength={1}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    placeholder="Task title"
                    required
                    value={editingTitle}
                  />
                </label>
                <div className="hu-dialog-field-grid">
                  <div className="hu-edit-field hu-duration-field">
                    <span className="hu-field-label">Duration</span>
                    <span className="hu-duration-input-wrap">
                      <input
                        aria-label="Task duration in minutes"
                        className="hu-edit-input hu-duration-input"
                        inputMode="numeric"
                        min="5"
                        max={MAX_TASK_DURATION_MINUTES}
                        ref={editingDurationInputRef}
                        onChange={(event) => setEditingDuration(event.target.value)}
                        placeholder="30"
                        step="5"
                        type="number"
                        value={editingDuration}
                      />
                      <span aria-hidden="true">min</span>
                    </span>
                    <div aria-label="Duration presets" className="hu-dialog-duration-presets">
                      {durationPresets.map((preset) => (
                        <button
                          aria-pressed={editingDuration === String(preset.minutes)}
                          className="hu-dialog-duration-preset"
                          key={preset.minutes}
                          type="button"
                          onClick={() => setEditingDuration(String(preset.minutes))}
                        >
                          {preset.dialogLabel}
                        </button>
                      ))}
                      <button
                        aria-pressed={editingDuration.trim() !== "" && !durationPresets.some((preset) => preset.minutes === Number(editingDuration))}
                        className="hu-dialog-duration-preset is-custom"
                        type="button"
                        onClick={() => editingDurationInputRef.current?.focus()}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  <div className="hu-edit-field">
                    <span className="hu-field-label">Priority</span>
                    <PriorityPicker
                      ariaLabel="Task priority"
                      value={editingPriority}
                      onChange={setEditingPriority}
                    />
                  </div>
                  <QuickDateField
                    ariaLabel="Custom task start date"
                    className="hu-edit-input"
                    fieldLabel="Start date"
                    today={logicalToday}
                    value={editingStartDate}
                    onChange={setEditingStartDate}
                  />
                  <QuickDateField
                    ariaLabel="Custom task due date"
                    className="hu-edit-input"
                    fieldLabel="Due date"
                    today={logicalToday}
                    value={editingDeadline}
                    onChange={setEditingDeadline}
                  />
                </div>
                <SpacePicker
                  onSpaceChange={setEditingSpaceId}
                  onSubSpaceChange={setEditingSubSpaceId}
                  spaceId={editingSpaceId}
                  spaces={spaces}
                  subSpaceId={editingSubSpaceId}
                />
                </div>
                <div className="hu-task-dialog-column hu-task-dialog-planning">
                <div className="hu-dialog-scheduling">
                  <div className="hu-dialog-scheduling-heading">
                    <div>
                      <span className="hu-field-label">Calendar scheduling</span>
                      <p>HeavyUser finds flexible work blocks around your Google Calendar.</p>
                    </div>
                  </div>
                  <div className="hu-dialog-field-grid is-scheduling">
                    <label className="hu-edit-field">
                      <span className="hu-field-label">Minimum block</span>
                      <span className="hu-duration-input-wrap">
                        <input
                          aria-label="Minimum calendar block in minutes"
                          className="hu-edit-input hu-duration-input"
                          inputMode="numeric"
                          min="5"
                          placeholder="Default"
                          step="5"
                          type="number"
                          value={editingMinBlockMinutes}
                          onChange={(event) => setEditingMinBlockMinutes(event.target.value)}
                        />
                        <span aria-hidden="true">min</span>
                      </span>
                    </label>
                    <label className="hu-edit-field">
                      <span className="hu-field-label">Maximum block</span>
                      <span className="hu-duration-input-wrap">
                        <input
                          aria-label="Maximum calendar block in minutes"
                          className="hu-edit-input hu-duration-input"
                          inputMode="numeric"
                          min="5"
                          placeholder="Default"
                          step="5"
                          type="number"
                          value={editingMaxBlockMinutes}
                          onChange={(event) => setEditingMaxBlockMinutes(event.target.value)}
                        />
                        <span aria-hidden="true">min</span>
                      </span>
                    </label>
                    <label className="hu-edit-field">
                      <span className="hu-field-label">Visibility</span>
                      <select
                        aria-label="Task calendar visibility"
                        className="hu-edit-input"
                        value={editingCalendarVisibility ?? "inherit"}
                        onChange={(event) => setEditingCalendarVisibility(event.target.value === "inherit" ? null : event.target.value as CalendarVisibility)}
                      >
                        <option value="inherit">Calendar default</option>
                        <option value="private">Private</option>
                        <option value="public">Public</option>
                      </select>
                    </label>
                    <label className="hu-edit-field">
                      <span className="hu-field-label">Availability</span>
                      <select
                        aria-label="Task calendar availability"
                        className="hu-edit-input"
                        value={editingCalendarTransparency ?? "inherit"}
                        onChange={(event) => setEditingCalendarTransparency(event.target.value === "inherit" ? null : event.target.value as CalendarTransparency)}
                      >
                        <option value="inherit">Calendar default</option>
                        <option value="opaque">Busy</option>
                        <option value="transparent">Free</option>
                      </select>
                    </label>
                  </div>
                  <div className="hu-task-schedule-panel" aria-live="polite">
                    <div className="hu-task-schedule-heading">
                      <div>
                        <span className="hu-field-label">Actual schedule</span>
                        <p>These are the calendar blocks HeavyUser has placed for this task.</p>
                      </div>
                      {editingScheduleLabel ? (
                        <span className={`hu-task-schedule-status is-${editingScheduleStatus?.state ?? (editingTask.duration === null ? "needs_duration" : "scheduling")}`}>
                          {editingScheduleLabel}
                        </span>
                      ) : null}
                    </div>
                    {editingScheduleBlocks.length > 0 ? (
                      <div className="hu-task-schedule-list">
                        {editingScheduleBlocks.slice(0, 6).map((block) => {
                          const formattedBlock = formatScheduleBlock(block);
                          if (!formattedBlock) {
                            return null;
                          }
                          const isPast = currentDateTime !== null && new Date(block.end).getTime() <= currentDateTime;
                          return (
                            <div className={`hu-task-schedule-item ${isPast ? "is-past" : ""}`} key={block.id}>
                              <CalendarDays aria-hidden="true" size={13} />
                              <span className="hu-task-schedule-item-copy">
                                <span className="hu-task-schedule-item-date">{formattedBlock.date}</span>
                                <time dateTime={block.start}>{formattedBlock.time}</time>
                              </span>
                              <span className="hu-task-schedule-item-state">{isPast ? "Past" : block.state === "locked" ? "Locked" : "Planned"}</span>
                            </div>
                          );
                        })}
                        {editingScheduleBlocks.length > 6 ? (
                          <span className="hu-task-schedule-more">+ {editingScheduleBlocks.length - 6} more block{editingScheduleBlocks.length - 6 === 1 ? "" : "s"}</span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="hu-task-schedule-empty">
                        {editingTask.duration === null
                          ? "Add a duration to let HeavyUser find the next available time."
                          : "No calendar block yet. Save changes and HeavyUser will find the next available working time."}
                      </p>
                    )}
                    {editingScheduleStatus?.warning ? <p className="hu-task-schedule-warning"><CircleAlert aria-hidden="true" size={13} />{editingScheduleStatus.warning}</p> : null}
                    <div className="hu-work-history-panel">
                      <div className="hu-task-schedule-heading">
                        <div>
                          <span className="hu-field-label">Work history</span>
                          <p>Actual work is separate from planned calendar time.</p>
                        </div>
                        <button
                          aria-expanded={isLoggingWork}
                          className="hu-inline-history-action"
                          disabled={Boolean(timerRequestTaskId)}
                          type="button"
                          onClick={() => (isLoggingWork ? handleCancelLogWork() : handleBeginLogWork(editingTask.id))}
                        >
                          {isLoggingWork ? <X aria-hidden="true" size={13} /> : <PlusCircle aria-hidden="true" size={13} />}
                          {isLoggingWork ? "Cancel" : "Log work"}
                        </button>
                      </div>
                      {isLoggingWork ? (
                        <div aria-label="Log work" className="hu-session-correction" role="group">
                          <div className="hu-session-correction-fields is-single">
                            <label>
                              <span>Minutes worked</span>
                              <input
                                aria-label="Minutes worked"
                                autoComplete="off"
                                inputMode="numeric"
                                max="1440"
                                min="1"
                                ref={loggingWorkInputRef}
                                type="number"
                                value={loggingWorkMinutes}
                                onChange={(event) => setLoggingWorkMinutes(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void handleLogWork(editingTask.id, undefined, loggingWorkMinutes);
                                  } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    handleCancelLogWork();
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="hu-session-correction-actions">
                            <button
                              className="hu-session-correct-button is-primary"
                              disabled={Boolean(timerRequestTaskId)}
                              type="button"
                              onClick={() => void handleLogWork(editingTask.id, undefined, loggingWorkMinutes)}
                            >
                              {timerRequestTaskId === editingTask.id ? "Saving…" : "Save work"}
                            </button>
                            <button className="hu-session-correct-button" disabled={Boolean(timerRequestTaskId)} type="button" onClick={handleCancelLogWork}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {editingWorkSummary ? (
                        <p className="hu-work-history-total">
                          <strong>{editingWorkSummary.workedMinutes}m worked</strong>
                          {editingWorkSummary.remainingMinutes === null ? " · No estimate" : ` · ${editingWorkSummary.remainingMinutes}m remaining`}
                        </p>
                      ) : <p className="hu-task-schedule-empty">No work recorded yet.</p>}
                      {editingWorkSummary?.sessions.length ? (
                        <div className="hu-work-session-list">
                          {editingWorkSummary.sessions.filter((session) => session.state !== "cancelled").slice(0, 6).map((session) => (
                            correctingSessionId === session.id ? (
                              <div aria-label="Correct work entry" className="hu-session-correction" key={session.id} role="group">
                                <div className="hu-session-correction-fields">
                                  <label>
                                    <span>Minutes</span>
                                    <input
                                      aria-label="Corrected work minutes"
                                      inputMode="numeric"
                                      min="1"
                                      max="1440"
                                      onChange={(event) => setCorrectingMinutes(event.target.value)}
                                      type="number"
                                      value={correctingMinutes}
                                    />
                                  </label>
                                  <label>
                                    <span>Reason</span>
                                    <input
                                      aria-label="Correction reason"
                                      maxLength={500}
                                      onChange={(event) => setCorrectionReason(event.target.value)}
                                      value={correctionReason}
                                    />
                                  </label>
                                </div>
                                <div className="hu-session-correction-actions">
                                  <button className="hu-session-correct-button is-primary" disabled={timerRequestTaskId === session.taskId} type="button" onClick={() => void handleSaveCorrectedSession(session)}>{timerRequestTaskId === session.taskId ? "Saving…" : "Save"}</button>
                                  <button className="hu-session-correct-button" disabled={timerRequestTaskId === session.taskId} type="button" onClick={handleCancelCorrectSession}>Cancel</button>
                                </div>
                              </div>
                            ) : deletingSessionId === session.id ? (
                              <div className="hu-work-session-item hu-work-session-delete-confirm" key={session.id}>
                                <Trash2 aria-hidden="true" size={13} />
                                <span>Remove this work entry?</span>
                                <div className="hu-session-correction-actions">
                                  <button className="hu-session-correct-button is-danger" disabled={timerRequestTaskId === session.taskId} type="button" onClick={() => void handleDeleteSession(session)}>{timerRequestTaskId === session.taskId ? "Removing…" : "Remove"}</button>
                                  <button className="hu-session-correct-button" disabled={timerRequestTaskId === session.taskId} type="button" onClick={handleCancelDeleteSession}>Keep</button>
                                </div>
                              </div>
                            ) : (
                              <div className="hu-work-session-item" key={session.id}>
                                <History aria-hidden="true" size={13} />
                                <span className="hu-work-session-copy">
                                  <strong>{session.source === "manual" ? "Logged work" : session.state === "paused" ? "Paused timer" : "Timer"}</strong>
                                  <time dateTime={session.startedAt}>{new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
                                </span>
                                <span className="hu-work-session-minutes">{Math.max(1, Math.floor(session.workedSeconds / 60))}m</span>
                                {session.state !== "running" ? (
                                  <div className="hu-work-session-actions">
                                    <button aria-label={`Correct ${Math.max(1, Math.floor(session.workedSeconds / 60))} minute work entry`} className="hu-session-correct-button" type="button" onClick={() => handleBeginCorrectSession(session)}>Correct</button>
                                    <button aria-label="Delete work entry" className="hu-session-delete-button" type="button" onClick={() => handleRequestDeleteSession(session)}>Delete</button>
                                  </div>
                                ) : null}
                              </div>
                            )
                          ))}
                        </div>
                      ) : null}
                      {sessionActionError ? <p className="hu-session-action-error" role="alert">{sessionActionError}</p> : null}
                    </div>
                    {editingMissedBlocks.length > 0 ? (
                      <div className="hu-missed-block-panel">
                        <div className="hu-task-schedule-heading">
                          <div>
                            <span className="hu-field-label">Missed calendar time</span>
                            <p>This time was not counted as work and is ready to schedule again.</p>
                          </div>
                        </div>
                        {editingMissedBlocks.slice(0, 4).map((block) => (
                          <div className="hu-missed-block-item" key={block.id}>
                            <span>{block.minutes}m missed</span>
                            <div>
                              <button type="button" onClick={() => void handleStartTimer(editingTask.id, { missedBlockId: block.id })}>Start</button>
                              <button type="button" onClick={() => void handleLogWork(editingTask.id, { startedAt: block.start, stoppedAt: block.end, blockId: block.id })}>Log work</button>
                              <button type="button" onClick={() => void handleRescheduleMissed(block.id)}>Reschedule</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                </div>
              </div>

              {editingError ? <p className="hu-form-error" role="alert">{editingError}</p> : null}

              <div className="hu-task-dialog-actions">
                <button className="hu-form-button is-primary" type="submit">
                  Save changes
                </button>
                <button className="hu-form-button" type="button" onClick={handleCancelEditing}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

      </div>
    </main>
  );
}
