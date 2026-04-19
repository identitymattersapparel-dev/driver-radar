import { supabase } from "../lib/supabase";
import { normalizeLocationKey } from "../utils/locations";

export async function findOrCreateLocation({
  displayName,
  addressLine1,
  addressLine2 = "",
  city = "",
  state = "",
  postalCode = "",
}) {
  const normalizedKey = normalizeLocationKey({
    addressLine1,
    city,
    state,
    postalCode,
  });

  if (!addressLine1 || !normalizedKey) {
    throw new Error("Missing required location fields");
  }

  const { data: existing, error: findError } = await supabase
    .from("locations")
    .select("*")
    .eq("normalized_key", normalizedKey)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await supabase
    .from("locations")
    .insert({
      display_name: displayName || addressLine1,
      address_line_1: addressLine1,
      address_line_2: addressLine2 || null,
      city: city || null,
      state: state || null,
      postal_code: postalCode || null,
      normalized_key: normalizedKey,
    })
    .select()
    .single();

  if (createError) {
    throw createError;
  }

  return created;
}
