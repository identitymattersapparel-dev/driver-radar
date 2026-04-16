import React, { useState } from "react";
import { parseTargetTime } from "../utils/time";

export default function StartScreen({ onStart }) {
  const [totalStops, setTotalStops] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [error, setError] = useState("");

  function handleStart() {
    const n = parseInt(totalStops, 10);
    if (!n || n < 1) {
      setError("Enter a valid stop count.");
      return;
    }
    setError("");
    onStart({
      totalStops: n,
      completedStops: 0,
      startTime: Date.now(),
      targetFinishTime: parseTargetTime(targetTime),
      notes: [],
    });
  }

  return (
    <div className="dr">
      <div className="sr">
        <div>
          <div className="sr-title">Start Route</div>
          <div className="sr-subtitle">Driver Radar</div>
        </div>

        <div className="sr-field">
          <label className="sr-label">Total Stops</label>
          <input
            className="sr-input"
            type="number"
            inputMode="numeric"
            placeholder="82"
            min={1}
            value={totalStops}
            onChange={(e) => {
              setTotalStops(e.target.value);
              setError("");
            }}
          />
        </div>

        <div className="sr-field">
          <label className="sr-label">Target Finish Time (optional)</label>
          <input
            className="sr-input"
            type="time"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
          />
        </div>

        <div className="sr-error">{error}</div>

        <button
          className="sr-btn"
          onClick={handleStart}
          disabled={!totalStops}
        >
          START ROUTE
        </button>
      </div>
    </div>
  );
}
