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

// ── Audio transcription via Netlify Function ──────────────────────────────────

async function transcribeAudio(blob) {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");

  const res = await fetch("/.netlify/functions/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Transcription request failed: ${res.status}`);
  }

  const json = await res.json();
  return (json.text || "").trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MainScreen({ session, globalNotes, onStopComplete, onSaveNote, onStartNewRoute }) {
  const { totalStops, completedStops, startTime, targetFinishTime, notes } = session;

  const [, setTick]                         = useState(0);
  const [alertVisible, setAlertVisible]     = useState(true);
  const [isRecording, setIsRecording]       = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceStatus, setVoiceStatus]       = useState(null);
  const [notesOpen, setNotesOpen]           = useState(false);
  const [pendingNote, setPendingNote]       = useState(null);
  const [locInput, setLocInput]             = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const statusTimerRef   = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setAlertVisible(true); }, [completedStops]);

  useEffect(() => () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    clearTimeout(statusTimerRef.current);
  }, []);

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

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showStatus("Microphone not supported", "error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];

        if (blob.size < 1000) {
          showStatus("No speech detected", "info");
          setIsTranscribing(false);
          return;
        }

        setIsTranscribing(true);

        try {
          const transcript = await transcribeAudio(blob);

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
        } catch (err) {
          console.error("[MainScreen] transcribeAudio:", err);
          showStatus("Transcription error", "error");
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setVoiceStatus(null);
    } catch (err) {
      console.error("[MainScreen] startRecording:", err);
      showStatus("Microphone access denied", "error");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  function handleVoiceTap() {
    if (isTranscribing) return;
    isRecording ? stopRecording() : startRecording();
  }

  function handleStopComplete() {
    if (isRecording || isTranscribing) return;
    onStopComplete();
  }

  const remaining  = totalStops - completedStops;
  const routeDone  = remaining === 0;
  const nextStop   = completedStops + 1;
  const pace       = getPaceLabel(completedStops, totalStops, startTime, targetFinishTime);
  const color      = paceColor(pace);
  const noteCount  = notes.filter(isValidNote).length;

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

  const voiceBtnLabel = isTranscribing ? "TRANSCRIBING..." : isRecording ? "LISTENING..." : "VOICE NOTE";

  const completeBtnClass = [
    "dr-btn-complete",
    routeDone                     ? "done"   : "",
    isRecording || isTranscribing ? "locked" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="dr">

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
          className={"dr-btn-voice" + (isRecording ? " recording" : "") + (isTranscribing ? " transcribing" : "")}
          onClick={handleVoiceTap}
        >
          <div className="voice-dot-row">
            <div className="voice-dot" />
            <span className={"dr-voice-label" + (isRecording || isTranscribing ? " recording-label" : "")}>
              {voiceBtnLabel}
            </span>
          </div>
        </button>
      </div>

      {!pendingNote && voiceStatus && (
        <div className={"dr-voice-status " + voiceStatus.type}>
          <span>{voiceStatus.text}</span>
        </div>
      )}

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
          <button className="dr-btn-new-route" onClick={onStartNewRoute}>
            START NEW ROUTE
          </button>
        </div>
      ) : null}

      {notesOpen && (
        <NotesPanel notes={notes} onClose={() => setNotesOpen(false)} />
      )}
    </div>
  );
}
