/**
 * Resolves the reference date for benefits eligibility and enrollment calculations
 * from `EMPLOYEE_BENEFITS_FLOW_CURRENT_DATE` or defaults to current system time.
 *
 * @returns Valid Date object.
 * @throws Error if the environment variable contains an unparseable date.
 */
export function employeeBenefitsCurrentDate(): Date {
  const configured = process.env.EMPLOYEE_BENEFITS_FLOW_CURRENT_DATE;
  const date = configured ? new Date(configured) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("EMPLOYEE_BENEFITS_FLOW_CURRENT_DATE must be a valid date.");
  return date;
}

/**
 * Creates a JSON round-tripped deep clone of a value to ensure clean serialization in state persistence.
 *
 * @param value - Value to clone.
 * @returns Deeply cloned value.
 */
export function durableBenefitsJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Formats a terminal exit prompt reminding the user that this is a demonstration environment
 * and official plan documents control.
 *
 * @param message - Custom exit message preamble.
 * @returns Complete prompt text for TerminateSessionStep.
 */
export function benefitsTerminalPrompt(message: string): string {
  return `${message} State that this is a fictional benefits demonstration, official plan documents control, and pending coverage is not active until approved. Do not request payment, government identifiers, health diagnoses, or unrelated personal information.`;
}
