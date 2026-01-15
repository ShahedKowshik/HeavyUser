
import { CalendarEvent } from "../types";

export const getGoogleCalendarEvents = async (token: string, timeMin: string, timeMax: string): Promise<CalendarEvent[]> => {
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.warn("Google Calendar API request failed", response.status);
      return [];
    }

    const data = await response.json();
    return (data.items || []).map((item: any) => {
      const start = item.start.dateTime || item.start.date;
      const end = item.end.dateTime || item.end.date;
      const allDay = !item.start.dateTime;

      return {
        id: item.id,
        title: item.summary || '(No Title)',
        start: start,
        end: end,
        allDay: allDay,
        htmlLink: item.htmlLink,
      };
    });
  } catch (error) {
    console.error("Error fetching Google Calendar events:", error);
    return [];
  }
};
