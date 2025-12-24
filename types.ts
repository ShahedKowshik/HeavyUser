
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
  priority: Priority;
  subtasks: Subtask[];
  tags?: string[];
  notes?: string;
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
  completedDates: string[]; // Array of ISO Date strings (YYYY-MM-DD)
}

export interface UserSettings {
  userName: string;
  userId: string;
  profilePicture?: string;
}
