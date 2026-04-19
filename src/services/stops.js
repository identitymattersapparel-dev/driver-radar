import { supabase } from "../lib/supabase";
import { findOrCreateLocation } from "./locations";

export async function createStop({
  routeSessionId,
  sequenceNumber,
  displayName,
  addressLine1,
  addressLine2 = "",
  city = "",
  state = "",
  postalCode = "",
}) {
  if (!routeSessionId) {
    throw new Error("Missing routeSessionId");
  }

  if (!sequenceNumber || Number(sequenceNumber) < 1) {
    throw new Error("Missing or invalid sequenceNumber");
  }

  if (!addressLine1) {
    throw new Error("Missing addressLine1");
  }

  const location = await findOrCreateLocation({
    displayName,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
  });

  const { data, error } = await supabase
    .from("stops")
    .insert({
      route_session_id: routeSessionId,
      location_id: location.id,
      sequence_number: sequenceNumber,
      display_name: displayName || addressLine1,
      address_line_1: addressLine1,
      address_line_2: addressLine2 || null,
      city: city || null,
      state: state || null,
      postal_code: postalCode || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
