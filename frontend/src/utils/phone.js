import { parsePhoneNumberFromString } from "libphonenumber-js";

export const INVALID_PHONE_MESSAGE =
  "Enter a valid phone number with country code (e.g. +14155552671)";

export function parsePhoneInput(phone) {
  const raw = String(phone || "").trim();
  if (!raw) {
    return { ok: false, error: "Phone number is required" };
  }

  const parsed = parsePhoneNumberFromString(raw);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, error: INVALID_PHONE_MESSAGE };
  }

  return { ok: true, phone: parsed.format("E.164") };
}
