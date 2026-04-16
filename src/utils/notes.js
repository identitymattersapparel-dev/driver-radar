export function getAlertLabel(text) {
  const t = text.toLowerCase();
  if (
    t.includes("gate") ||
    t.includes("code") ||
    t.includes("call box") ||
    t.includes("callbox")
  )
    return "GATE CODE";
  if (t.includes("dog") || t.includes("beware of dog")) return "DOG WARNING";
  if (t.includes("locker") || t.includes("parcel locker")) return "LOCKER";
  if (
    t.includes("rear") ||
    t.includes("back door") ||
    t.includes("back entrance")
  )
    return "REAR DOOR";
  return "NOTE";
}

export function isValidNote(n) {
  return n && typeof n.text === "string" && n.text.trim().length > 0;
}

export function mostRecent(notes) {
  return notes.reduce((best, n) => (n.createdAt > best.createdAt ? n : best));
}

export function locMatch(a, b) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Reject keys shorter than 3 chars after trimming to prevent bad matches.
export function cleanLocationKey(raw) {
  const key = raw.trim();
  return key.length >= 3 ? key : null;
}

// Priority:
// 1. session notes — stopNumber match
// 2. session notes — locationKey match
// 3. global notes  — locationKey match
// 4. global notes  — routeStopKey match
export function getActiveAlert(sessionNotes, globalNotes, currentStop, currentLocationKey) {
  const valid = (arr) => arr.filter(isValidNote);

  const s1 = valid(sessionNotes).filter((n) => n.stopNumber === currentStop);
  if (s1.length) return { note: mostRecent(s1), source: "session" };

  if (currentLocationKey) {
    const s2 = valid(sessionNotes).filter((n) =>
      locMatch(n.locationKey, currentLocationKey)
    );
    if (s2.length) return { note: mostRecent(s2), source: "session" };

    const g3 = valid(globalNotes).filter((n) =>
      locMatch(n.locationKey, currentLocationKey)
    );
    if (g3.length) return { note: mostRecent(g3), source: "global" };
  }

  const g4 = valid(globalNotes).filter((n) => n.routeStopKey === currentStop);
  if (g4.length) return { note: mostRecent(g4), source: "global" };

  return null;
}
