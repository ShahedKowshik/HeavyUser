
export type AppTab = 'tasks' | 'habit' | 'journal' | 'settings';

export type Priority = 'Urgent' | 'High' | 'Normal' | 'Low';

export interface User {
  id: string;
  email: string;
  name: string;
  profilePicture?: string;
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
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
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
}

export interface UserSettings {
  userName: string;
  userId: string;
  email: string;
  profilePicture?: string;
}