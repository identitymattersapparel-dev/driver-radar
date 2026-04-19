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

const MAX_RECORDING_MS = 90000;
const MIN_RECORDING_MS = 1200;
const MIN_BLOB_BYTES = 2000;
const TRANSCRIBE_TIMEOUT_MS = 20000;
const TRANSCRIBE_RETRIES = 1;

function getSupportedMimeType() {
  const options = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];

  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }

  return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function transcribeAudio(blob, signal) {
  const formData = new FormData();
  formData.append(
    "file",
    blob,
    blob.type.includes("mp4") ? "audio.mp4" : "audio.webm"
  );

  const res = await fetch("/.netlify/functions/transcribe", {
    method: "POST",
    body: formData,
    signal,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error || `Transcription request failed: ${res.status}`);
  }

  return (json.text || "").trim();
}

export default function MainScreen({
  session,
  currentStop,
  globalNotes,
  locationNotes = [],
  onStopComplete,
  onSaveNote,
  onStartNewRoute,
}) {
  const {
    totalStops,
    completedStops,
    startTime,
    targetFinishTime,
    notes,
    localSessionKey,
    dbSessionId,
  } = session;

  const [, setTick] = useState(0);
  const [alertVisible, setAlertVisible] = useState(true);
  const [recordingPhase, setRecordingPhase] = useState("idle");
  const [voiceStatus, setVoiceStatus] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [pendingNote, setPendingNote] = useState(null);
  const [locInput, setLocInput] = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const statusTimerRef = useRef(null);
  const streamRef = useRef(null);
  const recordStartedAtRef = useRef(0);
  const recordTimeoutRef = useRef(null);
  const recordingContextRef = useRef(null);

  const isRecording = recordingPhase === "recording";
  const isTranscribing = recordingPhase === "transcribing";

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setAlertVisible(true);
  }, [completedStops, currentStop?.id]);

  useEffect(() => {
    return () => {
      clearTimeout(statusTimerRef.current);
      clearTimeout(recordTimeoutRef.current);
      cleanupRecorder();
    };
  }, []);

  function cleanupRecorder() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (_err) {}
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    recordStartedAtRef.current = 0;
    clearTimeout(recordTimeoutRef.current);
    recordTimeoutRef.current = null;
  }

  function showStatus(text, type) {
    clearTimeout(statusTimerRef.current);
    setVoiceStatus({ text, type });
    statusTimerRef.current = setTimeout(() => setVoiceStatus(null), 3000);
  }

  async function commitNote(note) {
    const ok = await onSaveNote(note);

    if (!ok) {
      showStatus("Save failed", "error");
      return;
    }

    setAlertVisible(true);
    setPendingNote(null);
    setLocInput("");
    showStatus("Saved", "saved");
  }

  function handleLocSave() {
    if (!pendingNote) return;

    commitNote({
      ...pendingNote,
      locationKey: cleanLocationKey(locInput),
    });
  }

  function handleLocSkip() {
    if (!pendingNote) return;
    commitNote(pendingNote);
  }

  async function startRecording() {
    if (pendingNote) {
      showStatus("Save current note first", "info");
      return;
    }

    if (!currentStop) {
      showStatus("No active stop", "error");
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      showStatus("Microphone not supported", "error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordStartedAtRef.current = Date.now();

      recordingContextRef.current = {
        stopNumber: currentStop.sequence_number,
        routeStopKey: currentStop.sequence_number,
        stopId: currentStop.id,
        locationId: currentStop.location_id,
        localSessionKey,
        dbSessionId,
      };

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("[MainScreen] recorder error:", event.error);
        cleanupRecorder();
        setRecordingPhase("idle");
        showStatus("Recording failed", "error");
      };

      recorder.onstop = async () => {
        const durationMs = Date.now() - recordStartedAtRef.current;
        const context = recordingContextRef.current;
        const chunks = [...audioChunksRef.current];
        const blobType = recorder.mimeType || mimeType || "audio/webm";

        cleanupRecorder();

        if (durationMs < MIN_RECORDING_MS) {
          setRecordingPhase("idle");
          showStatus("Recording too short", "info");
          return;
        }

        const blob = new Blob(chunks, { type: blobType });

        if (blob.size < MIN_BLOB_BYTES) {
          setRecordingPhase("idle");
          showStatus("Could not hear speech", "info");
          return;
        }

        setRecordingPhase("transcribing");

        let attempt = 0;
        let transcript = "";
        let lastError = null;

        while (attempt <= TRANSCRIBE_RETRIES && !transcript) {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(),
            TRANSCRIBE_TIMEOUT_MS
          );

          try {
            transcript = await transcribeAudio(blob, controller.signal);
          } catch (err) {
            lastError = err;
          } finally {
            clearTimeout(timeoutId);
          }

          attempt += 1;
        }

        setRecordingPhase("idle");

        if (transcript) {
          setPendingNote({
            id: Date.now(),
            text: transcript,
            createdAt: Date.now(),
            stopNumber: context.stopNumber,
            routeStopKey: context.routeStopKey,
            stopId: context.stopId,
            locationId: context.locationId,
            locationKey: null,
            localSessionKey: context.localSessionKey,
            dbSessionId: context.dbSessionId,
            source: "voice",
          });
          setLocInput("");
          return;
        }

        console.error("[MainScreen] transcribeAudio:", lastError);
        const message = lastError?.message || "Transcription failed";

        if (/timeout/i.test(message)) {
          showStatus("Transcription timed out", "error");
        } else if (/speech|hear|short|empty/i.test(message)) {
          showStatus("Could not hear speech - retry", "info");
        } else {
          showStatus("Transcription failed - retry", "error");
        }
      };

      recorder.start();
      setRecordingPhase("recording");
      setVoiceStatus(null);

      recordTimeoutRef.current = setTimeout(() => {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (err) {
      console.error("[MainScreen] startRecording:", err);
      cleanupRecorder();
      setRecordingPhase("idle");
      showStatus("Microphone access denied", "error");
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }

  function handleVoiceTap() {
    if (isTranscribing) return;

    if (isRecording) {
      stopRecording();
      return;
    }

    startRecording();
  }

  function handleStopComplete() {
    if (isRecording || isTranscribing || pendingNote) return;
    onStopComplete();
  }

  const remaining = totalStops - completedStops;
  const routeDone = remaining === 0;
  const nextStop = completedStops + 1;
  const pace = getPaceLabel(
    completedStops,
    totalStops,
    startTime,
    targetFinishTime
  );
  const color = paceColor(pace);
  const noteCount = notes.filter(isValidNote).length;

  const sessionStopNotes = notes.filter(
    (n) => n.stopNumber === nextStop && isValidNote(n)
  );

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

  const alertResult = getActiveAlert(
    notes,
    globalNotes,
    nextStop,
    currentLocationKey
  );
  const activeAlert = alertResult ? alertResult.note : null;
  const alertSource = alertResult ? alertResult.source : null;
  const alertLabel = activeAlert
    ? `${alertSource === "global" ? "PREV · " : ""}${getAlertLabel(
        activeAlert.text
      )} · Stop #${nextStop}`
    : null;

  const voiceBtnLabel = isTranscribing
    ? "TRANSCRIBING..."
    : isRecording
    ? "STOP RECORDING"
    : "VOICE NOTE";

  const voiceSubLabel = isTranscribing
    ? "Please wait"
    : isRecording
    ? "Tap to stop"
    : "Tap once to record";

  const completeBtnClass = [
    "dr-btn-complete",
    routeDone ? "done" : "",
    isRecording || isTranscribing || pendingNote ? "locked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const visibleLocationNotes = locationNotes
    .filter((note) => note && note.text)
    .slice(0, 3);

  return (
    <div className="dr">
      <div className="dr-status">
        <div className="dr-pace">
          <div className="dr-pace-dot" style={{ background: color }} />
          <span className="dr-pace-text" style={{ color }}>
            {pace}
          </span>
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
          <polyline
            points="30,62 90,48 160,30 230,42 295,18 370,26 415,16"
            fill="none"
            stroke="#1e3a5f"
            strokeWidth={3}
            strokeDasharray="7 5"
          />
          <polyline
            points="30,62 90,48 160,30 230,42 295,18"
            fill="none"
            stroke="#3b82f6"
            strokeWidth={3.5}
          />
          <circle cx={30} cy={62} r={5} fill="#22c55e" />
          <circle cx={295} cy={18} r={11} fill="none" stroke="#60a5fa" strokeWidth={2.5} />
          <circle cx={295} cy={18} r={5} fill="#60a5fa" />
          <circle cx={415} cy={16} r={5} fill="#f59e0b" opacity={0.5} />
        </svg>
        {!routeDone && <div className="dr-map-tag">NEXT: #{nextStop}</div>}
      </div>

      {!routeDone && visibleLocationNotes.length > 0 && (
        <div className="dr-location-notes">
          <div className="dr-location-notes-title">LOCATION NOTES</div>
          {visibleLocationNotes.map((note) => (
            <div key={note.id} className="dr-location-note-item">
              {note.text}
            </div>
          ))}
        </div>
      )}

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
          className={
            "dr-btn-voice" +
            (isRecording ? " recording" : "") +
            (isTranscribing ? " transcribing" : "")
          }
          onClick={handleVoiceTap}
        >
          <div className="voice-dot-row">
            <div className="voice-dot" />
            <span
              className={
                "dr-voice-label" +
                (isRecording || isTranscribing ? " recording-label" : "")
              }
            >
              {voiceBtnLabel}
            </span>
          </div>
          <div className="dr-voice-subtext">{voiceSubLabel}</div>
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
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLocSave();
            }}
            autoFocus
          />
          <button className="dr-loc-save" onClick={handleLocSave}>
            Save
          </button>
          <button className="dr-loc-skip" onClick={handleLocSkip}>
            Skip
          </button>
        </div>
      )}

      {!routeDone && activeAlert && alertVisible ? (
        <div className={"dr-alert" + (alertSource === "global" ? " prev" : "")}>
          <div className="dr-alert-body">
            <span className="dr-alert-label">{alertLabel}</span>
            <span className="dr-alert-value">{activeAlert.text}</span>
          </div>
          <div
            className="dr-alert-dismiss"
            onClick={() => setAlertVisible(false)}
          >
            ✕
          </div>
        </div>
      ) : routeDone ? (
        <div className="dr-complete-banner">
          <span>Route Complete</span>
          <button className="dr-btn-new-route" onClick={onStartNewRoute}>
            START NEW ROUTE
          </button>
        </div>
      ) : null}

      {notesOpen && <NotesPanel notes={notes} onClose={() => setNotesOpen(false)} />}
    </div>
  );
}
