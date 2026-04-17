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

function makeLocalSessionKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [globalNotes, setGlobalNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const dbSessionIdRef = useRef(null);

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
            totalStops: activeRow.total_stops,
            completedStops: activeRow.completed_stops,
            startTime: new Date(activeRow.started_at).getTime(),
            targetFinishTime: activeRow.target_finish_time
              ? new Date(activeRow.target_finish_time)
              : null,
            notes: sessionNotes,
            localSessionKey: makeLocalSessionKey(),
            dbSessionId: activeRow.id,
          });
        }
      } catch (err) {
        console.error("[App] Failed to load persisted state:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPersistedState();
  }, []);

  const handleStart = useCallback(async (localSession) => {
    const sessionWithGuards = {
      ...localSession,
      localSessionKey: makeLocalSessionKey(),
      dbSessionId: null,
    };

    setSession(sessionWithGuards);

    const row = await createRouteSession({
      totalStops: localSession.totalStops,
      startTime: localSession.startTime,
      targetFinishTime: localSession.targetFinishTime,
    });

    if (row) {
      dbSessionIdRef.current = row.id;
      setSession((prev) => (prev ? { ...prev, dbSessionId: row.id } : prev));
    }
  }, []);

  const handleStopComplete = useCallback(async () => {
    setSession((prev) => {
      if (!prev) return prev;

      const next = Math.min(prev.completedStops + 1, prev.totalStops);
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

  const handleStartNewRoute = useCallback(() => {
    setSession(null);
    dbSessionIdRef.current = null;
  }, []);

  const handleSaveNote = useCallback(async (note) => {
    const currentDbSessionId = dbSessionIdRef.current;
    let isStale = false;

    setSession((prev) => {
      if (!prev) {
        isStale = true;
        return prev;
      }

      if (note.localSessionKey !== prev.localSessionKey) {
        isStale = true;
        return prev;
      }

      if (note.dbSessionId && prev.dbSessionId && note.dbSessionId !== prev.dbSessionId) {
        isStale = true;
        return prev;
      }

      return { ...prev, notes: [...prev.notes, note] };
    });

    if (isStale) {
      console.warn("[App] Rejected stale note save", note);
      return false;
    }

    setGlobalNotes((prev) => [...prev, note]);

    if (!currentDbSessionId) {
      return true;
    }

    const ok = await createNote(note, currentDbSessionId);

    if (!ok) {
      setSession((prev) => (
        prev
          ? { ...prev, notes: prev.notes.filter((n) => n.id !== note.id) }
          : prev
      ));
      setGlobalNotes((prev) => prev.filter((n) => n.id !== note.id));
      return false;
    }

    return true;
  }, []);

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
      onStartNewRoute={handleStartNewRoute}
    />
  );
}
