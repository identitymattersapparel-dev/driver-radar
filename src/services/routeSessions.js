import { supabase } from "../lib/supabase";

const unavailable = (fn) => {
  console.warn(`[routeSessions] ${fn}: Supabase unavailable — skipping.`);
};

export async function getActiveRouteSession() {
  if (!supabase) { unavailable("getActiveRouteSession"); return null; }

  const { data, error } = await supabase
    .from("route_sessions")
    .select("*")
    .eq("is_active", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[routeSessions] getActiveRouteSession:", error.message);
    return null;
  }
  return data;
}

export async function createRouteSession({ totalStops, startTime, targetFinishTime }) {
  if (!supabase) { unavailable("createRouteSession"); return null; }

  const { data, error } = await supabase
    .from("route_sessions")
    .insert({
      total_stops:        totalStops,
      completed_stops:    0,
      started_at:         new Date(startTime).toISOString(),
      target_finish_time: targetFinishTime
        ? new Date(targetFinishTime).toISOString()
        : null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("[routeSessions] createRouteSession:", error.message);
    return null;
  }
  return data;
}

export async function updateRouteSessionProgress(sessionId, completedStops) {
  if (!supabase) { unavailable("updateRouteSessionProgress"); return; }

  const { error } = await supabase
    .from("route_sessions")
    .update({ completed_stops: completedStops })
    .eq("id", sessionId);

  if (error) {
    console.error("[routeSessions] updateRouteSessionProgress:", error.message);
  }
}

export async function completeRouteSession(sessionId) {
  if (!supabase) { unavailable("completeRouteSession"); return; }

  const { error } = await supabase
    .from("route_sessions")
    .update({ is_active: false })
    .eq("id", sessionId);

  if (error) {
    console.error("[routeSessions] completeRouteSession:", error.message);
  }
}
