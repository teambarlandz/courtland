// phone.ts — Nigerian phone handling (E.164, +234 only).
export const NG_PHONE_RE = /^\+234[0-9]{10}$/;

export function isValidNgPhone(input: string): boolean {
  return NG_PHONE_RE.test(input.trim());
}

export function normaliseNgPhone(input: string): string {
  let digits = input.trim().replace(/[\s()-]/g, "");
  if (digits.startsWith("+234")) {
    // already international
  } else if (digits.startsWith("234")) {
    digits = `+${digits}`;
  } else if (digits.startsWith("0")) {
    digits = `+234${digits.slice(1)}`;
  } else {
    throw new Error(`cannot normalise phone number: ${input}`);
  }
  if (!isValidNgPhone(digits)) throw new Error(`invalid Nigerian number: ${input}`);
  return digits;
}

export function maskPhone(e164: string): string {
  if (!isValidNgPhone(e164)) throw new Error(`invalid Nigerian number: ${e164}`);
  return `${e164.slice(0, 6)}***${e164.slice(-2)}`;
}
