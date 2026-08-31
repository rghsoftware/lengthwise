export const SUPPORTED_LENGTHWISE_VERSION = 1;

/** Cheap textual sniff for the `lengthwise:` recognition marker, ahead of a full YAML parse (REQ-003). */
export function looksMarked(text: string): boolean {
  return /^lengthwise:\s*\S+\s*$/m.test(text);
}
