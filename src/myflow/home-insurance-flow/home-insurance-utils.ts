export function homeInsuranceCurrentDate(): Date {
  const configured = process.env.HOME_INSURANCE_FLOW_CURRENT_DATE;
  const date = configured ? new Date(configured) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("HOME_INSURANCE_FLOW_CURRENT_DATE must be a valid date.");
  }
  return date;
}

export function durableJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function terminalPrompt(message: string): string {
  return `${message} Remind the customer that no coverage has been bound and no payment has been taken. Do not discuss unrelated topics.`;
}
