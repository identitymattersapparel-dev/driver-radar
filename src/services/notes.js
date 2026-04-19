import { supabase } from "../lib/supabase";

export function buildRouteStopKey(stopNumber) {
  const n = Number(stopNumber);
  return Number.isFinite(n) && n > 0 ? `stop-${n}` : null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLocationKey(value) {
  const cleaned = String(value || "").trim().toLowerCase();
  return cleaned || null;
}

export async function createNote(note, sessionId) {
  const text = normalizeText(note?.text);

  if (!sessionId) {
    console.error("[notes.createNote] Missing sessionId");
    return false;
  }

  if (!text) {
    console.error("[notes.createNote] Empty note text");
    return false;
  }

  const stopNumber = Number(note?.stopNumber);
  const routeStopKey =
    note?.routeStopKey ?? buildRouteStopKey(stopNumber) ?? null;

  const payload = {
    route_session_id: sessionId,
    text,
    stop_number: Number.isFinite(stopNumber) ? stopNumber : null,
    route_stop_key: routeStopKey,
    location_key: normalizeLocationKey(note?.locationKey),
    source: note?.source || "typed",
    stop_id: note?.stopId || null,
    location_id: note?.locationId || null,
  };

  const { error } = await supabase.from("notes").insert(payload);

  if (error) {
    console.error("[notes.createNote] Insert failed:", error);
    return false;
  }

  return true;
}

export async function getSessionNotes(sessionId) {
  if (!sessionId) return [];

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("route_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[notes.getSessionNotes] Query failed:", error);
    return [];
  }

  return (data || []).map(mapNoteRow);
}

export async function getGlobalNotes() {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .not("location_key", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[notes.getGlobalNotes] Query failed:", error);
    return [];
  }

  return (data || []).map(mapNoteRow);
}

export async function getNotesForLocation(locationId) {
  if (!locationId) return [];

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[notes.getNotesForLocation] Query failed:", error);
    return [];
  }

  return (data || []).map(mapNoteRow);
}

function mapNoteRow(row) {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    stopNumber: row.stop_number,
    routeStopKey: row.route_stop_key,
    locationKey: row.location_key,
    source: row.source || "typed",
    stopId: row.stop_id || null,
    locationId: row.location_id || null,
    dbSessionId: row.route_session_id || null,
  };
}
