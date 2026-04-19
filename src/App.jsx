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
import { createStop } from "./services/stops";
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

            // Step 7 foundation:
            // older active sessions may not have hydrated stops loaded yet
            stops: [],
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
      stops: [],
    };

    setSession(sessionWithGuards);

    try {
      const row = await createRouteSession({
        totalStops: localSession.totalStops,
        startTime: localSession.startTime,
        targetFinishTime: localSession.targetFinishTime,
      });

      if (!row) {
        throw new Error("Failed to create route session");
      }

      dbSessionIdRef.current = row.id;

      const inputStops = Array.isArray(localSession.stops) ? localSession.stops : [];
      const createdStops = [];

      for (let i = 0; i < inputStops.length; i += 1) {
        const inputStop = inputStops[i];

        const createdStop = await createStop({
          routeSessionId: row.id,
          sequenceNumber: i + 1,
          displayName: inputStop.name || inputStop.displayName || "",
          addressLine1: inputStop.addressLine1 || inputStop.address || "",
          addressLine2: inputStop.addressLine2 || "",
          city: inputStop.city || "",
          state: inputStop.state || "",
          postalCode: inputStop.postalCode || "",
        });

        createdStops.push(createdStop);
      }

      setSession((prev) =>
        prev
          ? {
              ...prev,
              dbSessionId: row.id,
              stops: createdStops,
            }
          : prev
      );
    } catch (err) {
      console.error("[App] Failed to start route:", err);
      dbSessionIdRef.current = null;
      setSession(null);
      alert("Could not start route.");
    }
  }, []);

  const handleStopComplete = useCallback(() => {
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

      if (
        note.dbSessionId &&
        prev.dbSessionId &&
        note.dbSessionId !== prev.dbSessionId
      ) {
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
      setSession((prev) =>
        prev
          ? { ...prev, notes: prev.notes.filter((n) => n.id !== note.id) }
          : prev
      );
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
