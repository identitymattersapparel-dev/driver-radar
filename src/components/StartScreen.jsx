import React, { useState } from "react";
import { parseTargetTime } from "../utils/time";

function emptyStop() {
  return { name: "", addressLine1: "" };
}

export default function StartScreen({ onStart }) {
  const [targetTime, setTargetTime] = useState("");
  const [stops, setStops] = useState([emptyStop()]);
  const [error, setError] = useState("");

  function updateStop(index, field, value) {
    setStops((prev) =>
      prev.map((stop, i) =>
        i === index ? { ...stop, [field]: value } : stop
      )
    );
    setError("");
  }

  function addStop() {
    setStops((prev) => [...prev, emptyStop()]);
  }

  function removeStop(index) {
    setStops((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleStart() {
    const cleanedStops = stops
      .map((stop) => ({
        name: stop.name.trim(),
        addressLine1: stop.addressLine1.trim(),
      }))
      .filter((stop) => stop.name && stop.addressLine1);

    if (cleanedStops.length < 1) {
      setError("Add at least one valid stop.");
      return;
    }

    setError("");

    onStart({
      totalStops: cleanedStops.length,
      completedStops: 0,
      startTime: Date.now(),
      targetFinishTime: parseTargetTime(targetTime),
      notes: [],
      stops: cleanedStops,
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
          <label className="sr-label">Stops</label>

          {stops.map((stop, index) => (
            <div key={index} style={{ marginBottom: 12 }}>
              <input
                className="sr-input"
                type="text"
                placeholder={`Stop ${index + 1} name`}
                value={stop.name}
                onChange={(e) => updateStop(index, "name", e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <input
                className="sr-input"
                type="text"
                placeholder={`Stop ${index + 1} address`}
                value={stop.addressLine1}
                onChange={(e) =>
                  updateStop(index, "addressLine1", e.target.value)
                }
              />
              {stops.length > 1 && (
                <button
                  type="button"
                  className="sr-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => removeStop(index)}
                >
                  REMOVE STOP
                </button>
              )}
            </div>
          ))}

          <button type="button" className="sr-btn" onClick={addStop}>
            ADD STOP
          </button>
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

        {error ? <div className="sr-error">{error}</div> : null}

        <button className="sr-btn" onClick={handleStart}>
          START ROUTE
        </button>
      </div>
    </div>
  );
}
