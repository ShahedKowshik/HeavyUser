
export type AppTab = 'tasks' | 'journal' | 'settings';

export type Priority = 'Urgent' | 'High' | 'Normal' | 'Low';

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

export interface UserSettings {
  userName: string;
  userId: string;
  profilePicture?: string;
}
