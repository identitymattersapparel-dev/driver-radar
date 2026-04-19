export function normalizeLocationKey({
  addressLine1 = "",
  city = "",
  state = "",
  postalCode = "",
}) {
  const clean = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[.,#-]/g, " ")
      .replace(/\bstreet\b/g, "st")
      .replace(/\bavenue\b/g, "ave")
      .replace(/\broad\b/g, "rd")
      .replace(/\bdrive\b/g, "dr")
      .replace(/\blane\b/g, "ln")
      .replace(/\bcourt\b/g, "ct")
      .replace(/\bplace\b/g, "pl")
      .replace(/\bapartment\b/g, "apt")
      .replace(/\bsuite\b/g, "ste")
      .replace(/\s+/g, " ")
      .trim();

  return [
    clean(addressLine1),
    clean(city),
    clean(state),
    clean(postalCode),
  ].join("|");
}
