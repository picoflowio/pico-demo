/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import moment from 'moment';

type DOBType =
  | {
      day: number;
      month: number;
      year: number;
    }
  | { error: string };

/**
 * Validates a date of birth by day, month, and year, verifying the applicant is at least 18 years old.
 *
 * @param day - Calendar day of birth (1-31).
 * @param month - Calendar month of birth (1-12).
 * @param year - Four-digit year of birth.
 * @returns Object with date parts if age >= 18, or an error object if underage.
 */
export function ValidateDOB(day: number, month: number, year: number): DOBType {
  const dob = moment({ year, month: month - 1, day });
  const currentDate = moment();
  const yearsDifference = currentDate.diff(dob, 'years');

  if (yearsDifference >= 18) {
    return {
      day,
      month,
      year,
    };
  } else {
    return { error: 'applicant must be 18 years or older' };
  }
}
