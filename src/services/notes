import { supabase } from "../lib/supabase";

const unavailable = (fn) => {
  console.warn(`[notes] ${fn}: Supabase unavailable — skipping.`);
};

export async function createNote(note, sessionId) {
  if (!supabase) { unavailable("createNote"); return; }

  const base = {
    text:           note.text,
    created_at:     new Date(note.createdAt).toISOString(),
    stop_number:    note.stopNumber,
    route_stop_key: note.routeStopKey ?? note.stopNumber,
    location_key:   note.locationKey ?? null,
  };

  const rows = [
    { ...base, route_session_id: sessionId, scope: "session" },
    { ...base, route_session_id: null,      scope: "global"  },
  ];

  const { error } = await supabase.from("notes").insert(rows);

  if (error) {
    console.error("[notes] createNote:", error.message);
  }
}

export async function getSessionNotes(sessionId) {
  if (!supabase) { unavailable("getSessionNotes"); return []; }

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("route_session_id", sessionId)
    .eq("scope", "session")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[notes] getSessionNotes:", error.message);
    return [];
  }
  return data.map(dbRowToNote);
}

export async function getGlobalNotes() {
  if (!supabase) { unavailable("getGlobalNotes"); return []; }

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("scope", "global")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[notes] getGlobalNotes:", error.message);
    return [];
  }
  return data.map(dbRowToNote);
}

function dbRowToNote(row) {
  return {
    id:           row.id,
    text:         row.text,
    createdAt:    new Date(row.created_at).getTime(),
    stopNumber:   row.stop_number,
    routeStopKey: row.route_stop_key,
    locationKey:  row.location_key ?? null,
  };
}
