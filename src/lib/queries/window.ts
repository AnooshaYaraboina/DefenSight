import "server-only";

/**
 * Start of a trailing window, in days.
 *
 * Kept out of component bodies so no page performs a time-dependent
 * computation during render — that is what makes a server render and a client
 * hydration disagree.
 */
export function trailingWindow(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600_000);
}
