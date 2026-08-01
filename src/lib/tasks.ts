export type Priority = "urgent" | "high" | "normal" | "low";

export type Task = {
  id: string;
  title: string;
  duration: number | null;
  startDate: string | null;
  deadline: string | null;
  priority: Priority;
  status: "open" | "focus" | "done";
};
