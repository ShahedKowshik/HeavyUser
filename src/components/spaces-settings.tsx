"use client";

import { useEffect, useState } from "react";
import { Archive, CalendarDays, CalendarPlus, Check, Plus, RefreshCw, RotateCcw, Unplug } from "lucide-react";
import { getAppPath } from "@/lib/supabase/config";
import type { Space } from "@/lib/spaces";

type CalendarOption = { id: string; name: string; timeZone: string | null; primary: boolean; backgroundColor: string | null };

type CalendarConnection = {
  status: string;
  requiresReconnect?: boolean;
  accountEmail: string | null;
  calendarId: string | null;
  calendarName: string | null;
  lastError: string | null;
};

export function SpacesSettings() {
  const [spaces, setSpaces] = useState<ReadonlyArray<Space>>([]);
  const [calendars, setCalendars] = useState<ReadonlyArray<CalendarOption>>([]);
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [newSubSpace, setNewSubSpace] = useState<Record<string, string>>({});
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  async function load() {
    setIsLoading(true);
    setMessage("");
    try {
      const [spacesResponse, calendarsResponse, connectionResponse] = await Promise.all([
        fetch(getAppPath("/api/spaces"), { cache: "no-store" }),
        fetch(getAppPath("/api/google/calendar/calendars"), { cache: "no-store" }),
        fetch(getAppPath("/api/google/calendar/connection"), { cache: "no-store" }),
      ]);
      const spacesBody = (await spacesResponse.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; error?: string } | null;
      const calendarsBody = (await calendarsResponse.json().catch(() => null)) as { calendars?: ReadonlyArray<CalendarOption>; connection?: CalendarConnection | null; reconnectRequired?: boolean; error?: string } | null;
      const connectionBody = (await connectionResponse.json().catch(() => null)) as { connection?: CalendarConnection | null; error?: string } | null;
      if (!spacesResponse.ok) throw new Error(spacesBody?.error ?? "Spaces could not be loaded.");
      setSpaces(spacesBody?.spaces ?? []);
      const calendarConnection = calendarsBody?.connection
        ? calendarsBody.reconnectRequired
          ? { ...calendarsBody.connection, status: "error", requiresReconnect: true }
          : calendarsBody.connection
        : null;
      setConnection(calendarConnection ?? (connectionResponse.ok ? connectionBody?.connection ?? null : null));
      setCalendars(calendarsResponse.ok ? calendarsBody?.calendars ?? [] : []);
      const loadError = !connectionResponse.ok
        ? connectionBody?.error ?? "Calendar connection could not be checked. Try again."
        : !calendarsResponse.ok
          ? calendarsBody?.error ?? "Writable Google calendars could not be loaded. Try again."
          : "";
      setError(loadError);
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
    setMessage("");
    try {
      const response = await fetch(getAppPath("/api/spaces"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarId }) });
      const body = (await response.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; connection?: CalendarConnection | null; error?: string; syncPending?: boolean; followUpError?: string | null } | null;
      if (!response.ok) throw new Error(body?.error ?? "Calendar could not be added.");
      setSpaces(body?.spaces ?? []);
      if (body?.connection) {
        setConnection(body.connection);
      }
      setMessage(body?.syncPending
        ? `Calendar added as a Space. Background setup will retry${body.followUpError ? `: ${body.followUpError}` : "."}`
        : "Calendar added as a Space.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Calendar could not be added.");
    } finally { setSavingId(""); }
  }

  async function updateSpace(space: Space, status?: "active" | "archived") {
    setSavingId(space.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(getAppPath("/api/spaces"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId: space.id, name: draftNames[space.id] ?? space.name, status }) });
      const body = (await response.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; error?: string; schedulerWarning?: string | null } | null;
      if (!response.ok) throw new Error(body?.error ?? "Space could not be saved.");
      setSpaces(body?.spaces ?? []);
      setMessage(`${status === "archived" ? "Space archived." : status === "active" ? "Space restored." : "Space renamed."}${body?.schedulerWarning ? ` Scheduling will retry: ${body.schedulerWarning}` : ""}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Space could not be saved.");
    } finally { setSavingId(""); }
  }

  async function addSubSpace(spaceId: string) {
    const name = (newSubSpace[spaceId] ?? "").trim();
    if (!name) return;
    setSavingId(`sub:${spaceId}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(getAppPath("/api/spaces/subspaces"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId, name }) });
      const body = (await response.json().catch(() => null)) as { spaces?: ReadonlyArray<Space>; error?: string; schedulerWarning?: string | null } | null;
      if (!response.ok) throw new Error(body?.error ?? "Sub-space could not be added.");
      setSpaces(body?.spaces ?? []);
      setNewSubSpace((current) => ({ ...current, [spaceId]: "" }));
      setMessage(`Sub-space added.${body?.schedulerWarning ? ` Scheduling will retry: ${body.schedulerWarning}` : ""}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Sub-space could not be added.");
    } finally { setSavingId(""); }
  }

  function startGoogleConnection() {
    const returnTo = typeof window === "undefined" ? `${getAppPath("/settings")}#spaces` : `${window.location.pathname}#spaces`;
    const query = new URLSearchParams({ returnTo });
    window.location.href = `${getAppPath("/api/google/calendar/connect")}?${query.toString()}`;
  }

  async function disconnectGoogleCalendar() {
    if (isDisconnecting || !window.confirm("Disconnect Google Calendar? HeavyUser will pause scheduling and keep your existing Spaces for when you reconnect.")) {
      return;
    }

    setIsDisconnecting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(getAppPath("/api/google/calendar/connection"), { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; spaces?: ReadonlyArray<Space>; cleanupWarning?: string | null; error?: string } | null;
      if (!response.ok || body?.ok !== true) {
        throw new Error(body?.error ?? "Google Calendar could not be disconnected.");
      }
      setConnection(null);
      setCalendars([]);
      if (body.spaces) {
        setSpaces(body.spaces);
      }
      setMessage(body.cleanupWarning
        ? `Google Calendar disconnected. ${body.cleanupWarning}`
        : "Google Calendar disconnected. Reconnect it to resume scheduling.");
      window.dispatchEvent(new Event("heavyuser:schedule-refresh"));
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Google Calendar could not be disconnected.");
    } finally {
      setIsDisconnecting(false);
    }
  }

  const availableCalendars = calendars.filter((calendar) => !spaces.some((space) => space.calendarId === calendar.id));
  const isReconnectRequired = Boolean(connection?.requiresReconnect || connection?.status === "error");
  const isConnected = Boolean(connection?.calendarId) && !isReconnectRequired;
  const isAwaitingCalendar = connection?.status === "awaiting_calendar";

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

      <div className="hu-google-connection-card">
        <div className="hu-google-connection-copy">
          <span className="hu-field-label">Google Calendar connection</span>
          <h3>{isConnected ? "Calendar connected" : isReconnectRequired ? "Reconnect needed" : isAwaitingCalendar ? "Choose a calendar" : "Calendar disconnected"}</h3>
          <p>{isConnected
            ? `${connection?.accountEmail ?? "Google account"} · ${connection?.calendarName ?? "Calendar selected"}`
            : isReconnectRequired
              ? connection?.lastError ?? "Google Calendar access has expired or was removed."
              : isAwaitingCalendar
                ? "Choose a writable calendar below to finish reconnecting."
                : "Connect Google Calendar to schedule tasks and see commitments in the planner."}</p>
        </div>
        <div className="hu-google-connection-actions">
          {isConnected ? (
            <button className="hu-form-button" disabled={isDisconnecting || isLoading} type="button" onClick={() => void disconnectGoogleCalendar()}>
              <Unplug aria-hidden="true" size={13} />
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : isReconnectRequired ? (
            <button className="hu-form-button is-primary" type="button" onClick={startGoogleConnection}>
              <RefreshCw aria-hidden="true" size={13} />
              Reconnect Google Calendar
            </button>
          ) : isAwaitingCalendar ? (
            <button className="hu-form-button is-primary" type="button" onClick={() => void load()}>
              <CalendarDays aria-hidden="true" size={13} />
              Refresh calendars
            </button>
          ) : (
            <button className="hu-form-button is-primary" type="button" onClick={startGoogleConnection}>
              <CalendarDays aria-hidden="true" size={13} />
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>

      {isLoading ? <p className="hu-settings-message">Loading Spaces…</p> : null}
      {!isLoading && spaces.length === 0 ? <p className="hu-settings-message">Add your first writable Google Calendar below.</p> : null}
      <div className="hu-space-list">
        {spaces.map((space) => {
          const activeSubSpaces = space.subSpaces.filter((subSpace) => subSpace.status === "active");
          const draftName = draftNames[space.id] ?? space.name;
          const statusLabel = space.status === "active" ? "Active" : space.status === "disconnected" ? "Reconnect needed" : "Archived";

          return (
            <article className={`hu-space-card ${space.status !== "active" ? "is-archived" : ""}`} key={space.id}>
              <div className="hu-space-card-header">
                <div className="hu-space-card-identity">
                  <span className="hu-space-color" aria-hidden="true" />
                  <div>
                    <span className="hu-space-card-kicker">Calendar Space</span>
                    <h3>{draftName}</h3>
                    <p>{space.calendarName} <span aria-hidden="true">·</span> {space.timeZone}</p>
                  </div>
                </div>
                <div className="hu-space-card-header-actions">
                  <span className={`hu-space-status is-${space.status}`}>
                    <span className="hu-space-status-dot" aria-hidden="true" />
                    {statusLabel}
                  </span>
                  <button
                    aria-label={space.status === "active" ? `Archive ${draftName}` : `Restore ${draftName}`}
                    className="hu-space-archive-button"
                    disabled={savingId !== "" || isDisconnecting}
                    title={space.status === "active" ? "Archive Space" : "Restore Space"}
                    type="button"
                    onClick={() => void updateSpace(space, space.status === "active" ? "archived" : "active")}
                  >
                    {space.status === "active" ? <Archive aria-hidden="true" size={14} /> : <RotateCcw aria-hidden="true" size={14} />}
                  </button>
                </div>
              </div>

              <div className="hu-space-card-body">
                <div className="hu-space-rename-panel">
                  <div>
                    <label className="hu-field-label" htmlFor={`space-name-${space.id}`}>Space name</label>
                    <p>Give this calendar a name you will recognize in task lists.</p>
                  </div>
                  <div className="hu-space-name-control">
                    <input id={`space-name-${space.id}`} className="hu-task-input" value={draftName} disabled={space.status === "archived"} onChange={(event) => setDraftNames((current) => ({ ...current, [space.id]: event.target.value }))} />
                    <button className="hu-form-button is-primary" disabled={savingId !== "" || isDisconnecting || space.status === "archived"} type="button" onClick={() => void updateSpace(space)}><Check aria-hidden="true" size={13} />Save</button>
                  </div>
                </div>

                <div className="hu-space-subspaces-panel" aria-labelledby={`space-subspaces-${space.id}`}>
                  <div className="hu-space-subspaces-heading">
                    <div>
                      <span className="hu-field-label" id={`space-subspaces-${space.id}`}>Sub-spaces</span>
                      <p>Use smaller labels to keep work inside this calendar organized.</p>
                    </div>
                    <span className="hu-space-count">{activeSubSpaces.length} {activeSubSpaces.length === 1 ? "label" : "labels"}</span>
                  </div>

                  {activeSubSpaces.length > 0 ? (
                    <div className="hu-space-subspace-list">
                      {activeSubSpaces.map((subSpace) => <span className="hu-space-subspace" key={subSpace.id}>{subSpace.name}</span>)}
                    </div>
                  ) : <p className="hu-space-empty-subspaces">No sub-spaces yet. Add one when a label will help you find a task faster.</p>}

                  {space.status === "active" ? (
                    <div className="hu-space-add-subspace">
                      <input aria-label={`New Sub-space in ${draftName}`} className="hu-task-input" placeholder="Add a sub-space, like a project or domain" value={newSubSpace[space.id] ?? ""} onChange={(event) => setNewSubSpace((current) => ({ ...current, [space.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addSubSpace(space.id); } }} />
                      <button className="hu-form-button" disabled={savingId !== "" || isDisconnecting} type="button" onClick={() => void addSubSpace(space.id)}><Plus aria-hidden="true" size={13} />Add sub-space</button>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {availableCalendars.length > 0 ? (
        <div className="hu-space-calendar-picker">
          <div className="hu-space-calendar-picker-heading">
            <div>
              <span className="hu-field-label">Connect another calendar</span>
              <p>Every connected Google Calendar becomes a Space you can use for tasks.</p>
            </div>
            <CalendarPlus aria-hidden="true" size={17} />
          </div>
          {availableCalendars.map((calendar) => (
            <button className="hu-calendar-option" disabled={savingId !== "" || isDisconnecting} key={calendar.id} type="button" onClick={() => void addCalendar(calendar.id)}>
              <span className="hu-calendar-option-color" style={{ background: calendar.backgroundColor ?? "var(--primary)" }} aria-hidden="true" />
              <span><strong>{calendar.name}</strong><small>{calendar.primary ? "Primary calendar" : calendar.timeZone ?? "Google Calendar"}</small></span>
              <span className="hu-calendar-option-action"><Plus aria-hidden="true" size={14} />Add</span>
            </button>
          ))}
        </div>
      ) : null}
      {message ? <p className="hu-settings-message is-success" role="status">{message}</p> : null}
      {error ? (
        <div className="hu-settings-message is-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>Try again</button>
        </div>
      ) : null}
    </section>
  );
}
