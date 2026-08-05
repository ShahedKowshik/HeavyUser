"use client";

import { useEffect, useState } from "react";
import { Archive, Check, Plus, RotateCcw } from "lucide-react";
import { getAppPath } from "@/lib/supabase/config";
import type { Space } from "@/lib/spaces";

type CalendarOption = { id: string; name: string; timeZone: string | null; primary: boolean; backgroundColor: string | null };

export function SpacesSettings() {
  const [spaces, setSpaces] = useState<ReadonlyArray<Space>>([]);
  const [calendars, setCalendars] = useState<ReadonlyArray<CalendarOption>>([]);
  const [newSubSpace, setNewSubSpace] = useState<Record<string, string>>({});
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState("");

  async function load() {
    setIsLoading(true);
    try {
      const [spacesResponse, calendarsResponse] = await Promise.all([
        fetch(getAppPath("/api/spaces"), { cache: "no-store" }),
        fetch(getAppPath("/api/google/calendar/calendars"), { cache: "no-store" }),
      ]);
      const spacesBody = (await spacesResponse.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; error?: string } | null;
      const calendarsBody = (await calendarsResponse.json().catch(() => null)) as { calendars?: ReadonlyArray<CalendarOption>; error?: string } | null;
      if (!spacesResponse.ok) throw new Error(spacesBody?.error ?? "Spaces could not be loaded.");
      setSpaces(spacesBody?.spaces ?? []);
      setCalendars(calendarsResponse.ok ? calendarsBody?.calendars ?? [] : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Spaces could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function addCalendar(calendarId: string) {
    setSavingId(calendarId);
    setError("");
    try {
      const response = await fetch(getAppPath("/api/spaces"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarId }) });
      const body = (await response.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Calendar could not be added.");
      setSpaces(body?.spaces ?? []);
      setMessage("Calendar added as a Space.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Calendar could not be added.");
    } finally { setSavingId(""); }
  }

  async function updateSpace(space: Space, status?: "active" | "archived") {
    setSavingId(space.id);
    setError("");
    try {
      const response = await fetch(getAppPath("/api/spaces"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId: space.id, name: draftNames[space.id] ?? space.name, status }) });
      const body = (await response.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Space could not be saved.");
      setSpaces(body?.spaces ?? []);
      setMessage(status === "archived" ? "Space archived." : status === "active" ? "Space restored." : "Space renamed.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Space could not be saved.");
    } finally { setSavingId(""); }
  }

  async function addSubSpace(spaceId: string) {
    const name = (newSubSpace[spaceId] ?? "").trim();
    if (!name) return;
    setSavingId(`sub:${spaceId}`);
    setError("");
    try {
      const response = await fetch(getAppPath("/api/spaces/subspaces"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId, name }) });
      const body = (await response.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Sub-space could not be added.");
      setSpaces(body?.spaces ?? []);
      setNewSubSpace((current) => ({ ...current, [spaceId]: "" }));
      setMessage("Sub-space added.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Sub-space could not be added.");
    } finally { setSavingId(""); }
  }

  return (
    <section className="hu-settings-section" aria-labelledby="spaces-title">
      <div className="hu-settings-section-heading">
        <span className="hu-settings-mark" aria-hidden="true"><Archive size={17} /></span>
        <div>
          <span className="hu-field-label">Spaces</span>
          <h2 id="spaces-title">Your calendars and projects</h2>
          <p>Each calendar is its own Space. Sub-spaces are smaller labels inside it.</p>
        </div>
      </div>

      {isLoading ? <p className="hu-settings-message">Loading Spaces…</p> : null}
      {!isLoading && spaces.length === 0 ? <p className="hu-settings-message">Add your first writable Google Calendar below.</p> : null}
      <div className="hu-space-list">
        {spaces.map((space) => (
          <article className={`hu-space-card ${space.status === "archived" ? "is-archived" : ""}`} key={space.id}>
            <div className="hu-space-card-heading">
              <span className="hu-space-color" aria-hidden="true" />
              <div>
                <label className="hu-field-label" htmlFor={`space-name-${space.id}`}>Space name</label>
                <input id={`space-name-${space.id}`} className="hu-task-input" value={draftNames[space.id] ?? space.name} disabled={space.status === "archived"} onChange={(event) => setDraftNames((current) => ({ ...current, [space.id]: event.target.value }))} />
                <small>{space.calendarName} · {space.timeZone}</small>
              </div>
              <span className="hu-space-status">{space.status === "active" ? "Active" : "Archived"}</span>
            </div>
            <div className="hu-space-subspaces">
              <span className="hu-field-label">Sub-spaces</span>
              {space.subSpaces.filter((subSpace) => subSpace.status === "active").map((subSpace) => <span className="hu-space-subspace" key={subSpace.id}>{subSpace.name}</span>)}
              {space.status === "active" ? (
                <div className="hu-space-add-subspace">
                  <input aria-label={`New Sub-space in ${space.name}`} className="hu-task-input" placeholder="New Sub-space" value={newSubSpace[space.id] ?? ""} onChange={(event) => setNewSubSpace((current) => ({ ...current, [space.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addSubSpace(space.id); } }} />
                  <button className="hu-form-button" disabled={savingId === `sub:${space.id}`} type="button" onClick={() => void addSubSpace(space.id)}><Plus aria-hidden="true" size={13} />Add</button>
                </div>
              ) : null}
            </div>
            <div className="hu-settings-actions">
              <button className="hu-form-button" disabled={savingId === space.id} type="button" onClick={() => void updateSpace(space)}><Check aria-hidden="true" size={13} />Save name</button>
              <button className="hu-form-button" disabled={savingId === space.id} type="button" onClick={() => void updateSpace(space, space.status === "active" ? "archived" : "active")}>
                {space.status === "active" ? <><Archive aria-hidden="true" size={13} />Archive</> : <><RotateCcw aria-hidden="true" size={13} />Restore</>}
              </button>
            </div>
          </article>
        ))}
      </div>

      {calendars.length > 0 ? (
        <div className="hu-space-calendar-picker">
          <span className="hu-field-label">Add a Google Calendar</span>
          {calendars.filter((calendar) => !spaces.some((space) => space.calendarId === calendar.id)).map((calendar) => (
            <button className="hu-calendar-option" disabled={savingId === calendar.id} key={calendar.id} type="button" onClick={() => void addCalendar(calendar.id)}>
              <span className="hu-calendar-option-color" style={{ background: calendar.backgroundColor ?? "var(--primary)" }} aria-hidden="true" />
              <span><strong>{calendar.name}</strong><small>{calendar.primary ? "Primary calendar" : calendar.timeZone ?? "Google Calendar"}</small></span>
              <Plus aria-hidden="true" size={14} />
            </button>
          ))}
        </div>
      ) : null}
      {message ? <p className="hu-settings-message is-success" role="status">{message}</p> : null}
      {error ? <p className="hu-settings-message is-error" role="alert">{error}</p> : null}
    </section>
  );
}
