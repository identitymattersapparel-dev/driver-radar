import React, { useState, useEffect, useRef } from "react";
import NotesPanel from "./NotesPanel";
import { formatTime } from "../utils/time";
import { calcProjectedFinish, getPaceLabel, paceColor } from "../utils/pace";
import {
  getAlertLabel,
  isValidNote,
  mostRecent,
  cleanLocationKey,
  getActiveAlert,
} from "../utils/notes";

const speechSupported = !!(
  window.SpeechRecognition || window.webkitSpeechRecognition
);

export default function MainScreen({ session, globalNotes, onStopComplete, onSaveNote }) {
  const { totalStops, completedStops, startTime, targetFinishTime, notes } = session;

  const [, setTick]                     = useState(0);
  const [alertVisible, setAlertVisible] = useState(true);
  const [isRecording, setIsRecording]   = useState(false);
  const [voiceStatus, setVoiceStatus]   = useState(null);
  const [notesOpen, setNotesOpen]       = useState(false);
  const [pendingNote, setPendingNote]   = useState(null);
  const [locInput, setLocInput]         = useState("");

  const recognitionRef   = useRef(null);
  const statusTimerRef   = useRef(null);
  const resultHandledRef = useRef(false);

  // Refresh pace/finish time every 15s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // Re-show alert when driver advances to the next stop
  useEffect(() => {
    setAlertVisible(true);
  }, [completedStops]);

  // Clean up speech recognition on unmount
  useEffect(
    () => () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      clearTimeout(statusTimerRef.current);
    },
    []
  );

  function showStatus(text, type) {
    clearTimeout(statusTimerRef.current);
    setVoiceStatus({ text, type });
    statusTimerRef.current = setTimeout(() => setVoiceStatus(null), 3000);
  }

  function commitNote(note) {
    onSaveNote(note);
    setAlertVisible(true);
    setPendingNote(null);
    setLocInput("");
  }

  function handleLocSave() {
    if (!pendingNote) return;
    commitNote({ ...pendingNote, locationKey: cleanLocationKey(locInput) });
    showStatus("Note saved", "saved");
  }

  function handleLocSkip() {
    if (!pendingNote) return;
    commitNote({ ...pendingNote, locationKey: null });
    showStatus("Note saved", "saved");
  }

  function startRecording() {
    if (!speechSupported) {
      showStatus("Voice not supported", "error");
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous     = false;
    rec.interimResults = false;
    rec.lang           = "en-US";
    resultHandledRef.current = false;

    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();

      if (transcript) {
        setPendingNote({
          id:           Date.now(),
          text:         transcript,
          createdAt:    Date.now(),
          stopNumber:   completedStops + 1,
          routeStopKey: completedStops + 1,
          locationKey:  null,
        });
        setLocInput("");
      } else {
        showStatus("No speech detected", "info");
      }

      resultHandledRef.current = true;
      setIsRecording(false);
      recognitionRef.current = null;
    };

    rec.onerror = (event) => {
      if (!resultHandledRef.current) {
        showStatus(
          event.error === "no-speech" ? "No speech detected" : "Recording error",
          event.error === "no-speech" ? "info" : "error"
        );
        resultHandledRef.current = true;
      }
      setIsRecording(false);
      recognitionRef.current = null;
    };

    rec.onend = () => {
      if (!resultHandledRef.current) {
        showStatus("No speech detected", "info");
        resultHandledRef.current = true;
      }
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
    setVoiceStatus(null);
  }

  function stopRecording() {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
  }

  function handleVoiceTap() {
    isRecording ? stopRecording() : startRecording();
  }

  function handleStopComplete() {
    if (isRecording) return;
    onStopComplete();
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const remaining  = totalStops - completedStops;
  const routeDone  = remaining === 0;
  const nextStop   = completedStops + 1;
  const pace       = getPaceLabel(completedStops, totalStops, startTime, targetFinishTime);
  const color      = paceColor(pace);
  const noteCount  = notes.filter(isValidNote).length;

  // locationKey of the most recent session note for the upcoming stop (if any)
  const sessionStopNotes   = notes.filter((n) => n.stopNumber === nextStop && isValidNote(n));
  const currentLocationKey = sessionStopNotes.length
    ? mostRecent(sessionStopNotes).locationKey || null
    : null;

  let finishDisplay;
  if (completedStops === 0) {
    finishDisplay = targetFinishTime ? formatTime(targetFinishTime) : "--:--";
  } else {
    const proj = calcProjectedFinish(completedStops, totalStops, startTime);
    finishDisplay = proj
      ? formatTime(proj)
      : targetFinishTime
      ? formatTime(targetFinishTime)
      : "--:--";
  }

  const alertResult = getActiveAlert(notes, globalNotes, nextStop, currentLocationKey);
  const activeAlert = alertResult ? alertResult.note : null;
  const alertSource = alertResult ? alertResult.source : null;
  const alertLabel  = activeAlert
    ? (alertSource === "global" ? "PREV · " : "") +
      getAlertLabel(activeAlert.text) +
      " · Stop #" + nextStop
    : null;

  const completeBtnClass = [
    "dr-btn-complete",
    routeDone   ? "done"   : "",
    isRecording ? "locked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="dr">

      {/* Status bar */}
      <div className="dr-status">
        <div className="dr-pace">
          <div className="dr-pace-dot" style={{ background: color }} />
          <span className="dr-pace-text" style={{ color }}>{pace}</span>
        </div>
        <div className="dr-status-right">
          <div className="dr-finish">
            <span className="dr-finish-label">Finish</span>
            <span className="dr-finish-time">{finishDisplay}</span>
          </div>
          <button
            className={"dr-notes-btn" + (noteCount > 0 ? " has-notes" : "")}
            onClick={() => setNotesOpen(true)}
          >
            <span className="dr-notes-btn-count">{noteCount}</span>
            NOTES
          </button>
        </div>
      </div>

      {/* Map placeholder */}
      <div className="dr-map">
        <div className="dr-map-grid" />
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          viewBox="0 0 430 76"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="30,62 90,48 160,30 230,42 295,18 370,26 415,16" fill="none" stroke="#1e3a5f" strokeWidth={3} strokeDasharray="7 5" />
          <polyline points="30,62 90,48 160,30 230,42 295,18" fill="none" stroke="#3b82f6" strokeWidth={3.5} />
          <circle cx={30}  cy={62} r={5}  fill="#22c55e" />
          <circle cx={295} cy={18} r={11} fill="none" stroke="#60a5fa" strokeWidth={2.5} />
          <circle cx={295} cy={18} r={5}  fill="#60a5fa" />
          <circle cx={415} cy={16} r={5}  fill="#f59e0b" opacity={0.5} />
        </svg>
        {!routeDone && <div className="dr-map-tag">NEXT: #{nextStop}</div>}
      </div>

      {/* Action buttons */}
      <div className="dr-actions">
        <button className={completeBtnClass} onClick={handleStopComplete}>
          {routeDone ? "ROUTE DONE" : "STOP COMPLETE"}
          <span className="dr-btn-complete-sub">
            {routeDone
              ? `all ${totalStops} stops delivered`
              : `${completedStops} done · ${remaining} left`}
          </span>
        </button>

        <button
          className={"dr-btn-voice" + (isRecording ? " recording" : "")}
          onClick={handleVoiceTap}
        >
          <div className="voice-dot-row">
            <div className="voice-dot" />
            <span className={"dr-voice-label" + (isRecording ? " recording-label" : "")}>
              {isRecording ? "LISTENING..." : "VOICE NOTE"}
            </span>
          </div>
        </button>
      </div>

      {/* Voice status strip */}
      {!pendingNote && voiceStatus && (
        <div className={"dr-voice-status " + voiceStatus.type}>
          <span>{voiceStatus.text}</span>
        </div>
      )}

      {/* Location prompt */}
      {pendingNote && (
        <div className="dr-loc-prompt">
          <input
            className="dr-loc-input"
            type="text"
            placeholder="Address or label (optional)"
            value={locInput}
            onChange={(e) => setLocInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLocSave(); }}
            autoFocus
          />
          <button className="dr-loc-save" onClick={handleLocSave}>Save</button>
          <button className="dr-loc-skip" onClick={handleLocSkip}>Skip</button>
        </div>
      )}

      {/* Alert card / route complete banner */}
      {!routeDone && activeAlert && alertVisible ? (
        <div className={"dr-alert" + (alertSource === "global" ? " prev" : "")}>
          <div className="dr-alert-body">
            <span className="dr-alert-label">{alertLabel}</span>
            <span className="dr-alert-value">{activeAlert.text}</span>
          </div>
          <div className="dr-alert-dismiss" onClick={() => setAlertVisible(false)}>✕</div>
        </div>
      ) : routeDone ? (
        <div className="dr-complete-banner">
          <span>Route Complete</span>
        </div>
      ) : null}

      {/* Notes panel */}
      {notesOpen && (
        <NotesPanel notes={notes} onClose={() => setNotesOpen(false)} />
      )}
    </div>
  );
}
