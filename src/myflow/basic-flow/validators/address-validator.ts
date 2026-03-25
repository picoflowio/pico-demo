/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
const usStates = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

type AddressType = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

/**
 * Parses and validates a US address string.
 * @param addressStr - The address string to validate (e.g., "123 Main St., New York, NY 10001").
 * @returns A JSON object with parsed address components if valid, or null if invalid.
 */
export function ValidateAddress(addressStr: string): AddressType | null {
  if (typeof addressStr !== 'string' || !addressStr.trim()) {
    return null; // Invalid input
  }

  // Regular expression to parse the address into components
  const addressRegex = /^(.*?),\s*(.*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/;

  const match = addressStr.match(addressRegex);

  if (!match) return null;

  const [, street, city, state, zip] = match;

  // Validate street
  const streetRegex = /^[0-9a-zA-Z\s.,'#-]+$/;
  if (!street || !streetRegex.test(street)) return null;

  // Validate city
  const cityRegex = /^[a-zA-Z\s'.-]+$/;
  if (!city || !cityRegex.test(city)) return null;

  // Validate state
  if (!usStates.includes(state.toUpperCase())) return null;

  // Validate ZIP code
  const zipRegex = /^\d{5}(-\d{4})?$/;
  if (!zip || !zipRegex.test(zip)) return null;

  // If all validations pass, return the parsed address as a JSON object
  return {
    street,
    city,
    state,
    zip,
  };
}
