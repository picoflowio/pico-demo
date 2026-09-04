/**
 * Resolves the effective reference date for home insurance rating from `HOME_INSURANCE_FLOW_CURRENT_DATE`
 * environment override or defaults to the current system date.
 *
 * @returns Valid Date instance.
 * @throws Error if the environment variable contains an invalid date string.
 */
export function homeInsuranceCurrentDate(): Date {
  const configured = process.env.HOME_INSURANCE_FLOW_CURRENT_DATE;
  const date = configured ? new Date(configured) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("HOME_INSURANCE_FLOW_CURRENT_DATE must be a valid date.");
  }
  return date;
}

/**
 * Creates a JSON-safe deep copy of a value to ensure clean serializability in state persistence.
 *
 * @param value - Value to clone through JSON round-trip.
 * @returns Cloned value.
 */
export function durableJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Formats a terminal exit prompt ensuring the user is explicitly reminded that no coverage has been bound.
 *
 * @param message - Custom exit message or preamble.
 * @returns Complete prompt text for TerminateSessionStep.
 */
export function terminalPrompt(message: string): string {
  return `${message} Remind the customer that no coverage has been bound and no payment has been taken. Do not discuss unrelated topics.`;
}
