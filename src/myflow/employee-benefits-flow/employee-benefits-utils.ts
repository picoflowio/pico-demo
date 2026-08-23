export function employeeBenefitsCurrentDate(): Date {
  const configured = process.env.EMPLOYEE_BENEFITS_FLOW_CURRENT_DATE;
  const date = configured ? new Date(configured) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("EMPLOYEE_BENEFITS_FLOW_CURRENT_DATE must be a valid date.");
  return date;
}

export function durableBenefitsJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function benefitsTerminalPrompt(message: string): string {
  return `${message} State that this is a fictional benefits demonstration, official plan documents control, and pending coverage is not active until approved. Do not request payment, government identifiers, health diagnoses, or unrelated personal information.`;
}
