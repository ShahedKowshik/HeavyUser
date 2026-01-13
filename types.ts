

export type AppTab = 'tasks' | 'habit' | 'journal' | 'notes' | 'settings';

export type Priority = 'Urgent' | 'High' | 'Normal' | 'Low';

export interface User {
  id: string;
  email: string;
  name: string;
  profilePicture?: string;
  dayStartHour?: number; // 0-23
  startWeekDay?: number; // 0-6 (0 = Sunday, 1 = Monday, etc.)
  enabledFeatures?: string[];
}

export interface Tag {
  id: string;
  label: string;
  color: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Recurrence {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  weekDays?: number[]; // 0 (Sun) - 6 (Sat)
  monthDays?: number[]; // 1 - 31
  yearDays?: { month: number; day: number }[]; // month: 0-11, day: 1-31
}

export interface Task {
  id: string;
  title: string;
  dueDate: string;
  time?: string; // HH:mm 24h format
  completed: boolean;
  completedAt?: string | null; // ISO string for streak calculation
  priority: Priority;
  subtasks: Subtask[];
  tags?: string[];
  notes?: string;
  recurrence?: Recurrence | null;
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
  
  // Time Tracking
  plannedTime?: number; // In minutes
  actualTime?: number; // In minutes
  timerStart?: string | null; // ISO string if currently running
}

export interface TaskSession {
  id: string;
  taskId: string;
  startTime: string; // ISO
  endTime: string | null; // ISO
  duration: number; // seconds
}

export type EntryType = 'Log' | 'Gratitude';

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  timestamp: string; // ISO string
  rating: number | null; // 1-10, nullable for optionality
  entryType: EntryType;
  coverImage?: string; // URL for cover image
  tags?: string[];
}

export interface Habit {
  id: string;
  title: string;
  icon: string; // Emoji
  target: number; // Daily target count (e.g., 10 times)
  unit?: string; // Custom unit name (e.g., "liters", "pages", "steps")
  startDate: string; // ISO Date string (YYYY-MM-DD)
  useCounter: boolean; // Whether to track count or just simple completion
  progress: Record<string, number>; // Date (ISO) -> Count
  skippedDates: string[]; // Array of ISO Date strings that are exempted
  /** @deprecated kept for backward compatibility if needed during migration, prefer progress */
  completedDates?: string[];
  tags?: string[];
  goalType?: 'positive' | 'negative'; // 'positive' = Build habit, 'negative' = Quit/Limit habit
}

export interface Folder {
  id: string;
  name: string;
}

export interface Note {
  id: string;
  title: string;
  content: string; // HTML string for Rich Text
  folderId?: string | null;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  tags?: string[];
}

export interface UserSettings {
  userName: string;
  userId: string;
  email: string;
  profilePicture?: string;
  dayStartHour?: number;
  startWeekDay?: number;
  enabledFeatures?: string[];
}