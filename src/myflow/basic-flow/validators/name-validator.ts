/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
type ParsedName =
  | {
      firstName: string;
      middleName?: string;
      lastName: string;
    }
  | { error: string };

export function ValidateName(fullName: string): ParsedName {
  if (!fullName || typeof fullName !== 'string') {
    return { error: 'A full name is required.' };
  }

  // Trim extra spaces and split the name into parts
  const parts = fullName.trim().split(/\s+/);

  if (parts.length < 2) {
    // At least first and last name are required
    return { error: 'A full name is required.' };
  }

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  let middleName;

  if (parts.length === 3) {
    middleName = parts[1];
  } else if (parts.length > 3) {
    // Combine all middle parts for cases with multiple middle names
    middleName = parts.slice(1, parts.length - 1).join(' ');
  }

  return {
    firstName,
    middleName,
    lastName,
  };
  //   return `${firstName} ${middleNameOrInitial ? middleNameOrInitial : ''} ${lastName}`;
}
