import React, { useState, useCallback, useEffect, useRef } from "react";
import StartScreen from "./components/StartScreen";
import MainScreen from "./components/MainScreen";
import {
  getActiveRouteSession,
  createRouteSession,
  updateRouteSessionProgress,
  completeRouteSession,
} from "./services/routeSessions";
import { createNote, getSessionNotes, getGlobalNotes } from "./services/notes";
import "./App.css";

export default function App() {
  const [session, setSession]         = useState(null);
  const [globalNotes, setGlobalNotes] = useState([]);
  const [loading, setLoading]         = useState(true);

  // Supabase row id kept in a ref so handlers always see the latest value
  // without being added to the session shape components depend on.
  const dbSessionIdRef = useRef(null);

  // ── Load persisted state on mount ────────────────────────────────────────

  useEffect(() => {
    async function loadPersistedState() {
      try {
        const [activeRow, global] = await Promise.all([
          getActiveRouteSession(),
          getGlobalNotes(),
        ]);

        setGlobalNotes(global);

        if (activeRow) {
          dbSessionIdRef.current = activeRow.id;

          const sessionNotes = await getSessionNotes(activeRow.id);

          setSession({
            totalStops:       activeRow.total_stops,
            completedStops:   activeRow.completed_stops,
            startTime:        new Date(activeRow.started_at).getTime(),
            targetFinishTime: activeRow.target_finish_time
              ? new Date(activeRow.target_finish_time)
              : null,
            notes: sessionNotes,
          });
        }
      } catch (err) {
        // Supabase unavailable — fall back to empty local state gracefully
        console.error("[App] Failed to load persisted state:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPersistedState();
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStart = useCallback(async (localSession) => {
    // Show the route screen immediately (optimistic)
    setSession(localSession);

    const row = await createRouteSession({
      totalStops:       localSession.totalStops,
      startTime:        localSession.startTime,
      targetFinishTime: localSession.targetFinishTime,
    });

    if (row) {
      dbSessionIdRef.current = row.id;
    }
  }, []);

  const handleStopComplete = useCallback(async () => {
    setSession((prev) => {
      if (!prev) return prev;

      const next    = Math.min(prev.completedStops + 1, prev.totalStops);
      const updated = { ...prev, completedStops: next };

      if (dbSessionIdRef.current) {
        updateRouteSessionProgress(dbSessionIdRef.current, next);

        if (next === prev.totalStops) {
          completeRouteSession(dbSessionIdRef.current);
        }
      }

      return updated;
    });
  }, []);

  const handleSaveNote = useCallback(async (note) => {
    // Instant local update
    setSession((prev) =>
      prev ? { ...prev, notes: [...prev.notes, note] } : prev
    );
    setGlobalNotes((prev) => [...prev, note]);

    // Persist (two rows: one session-scoped, one global-scoped)
    if (dbSessionIdRef.current) {
      await createNote(note, dbSessionIdRef.current);
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="dr" />;
  }

  if (!session) {
    return <StartScreen onStart={handleStart} />;
  }

  return (
    <MainScreen
      session={session}
      globalNotes={globalNotes}
      onStopComplete={handleStopComplete}
      onSaveNote={handleSaveNote}
    />
  );
}
