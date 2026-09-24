import type { StepClassType } from '@picoflow/core';
import type { HotelPricingSearchRequest } from '../../tools/hotel-pricing-contract.js';
import type { SearchHotelEntry } from '../hotel-flow/backend/pricing-engine.js';
import { AmenityStep } from './amenity-step.js';
import { BudgetStep } from './budget-step.js';
import { DateRangeStep } from './date-range-step.js';
import { DistanceStep } from './distance-step.js';
import { RoomTypeStep } from './room-type-step.js';

/** The small part of a Step needed to read criterion state owned by other Steps. */
type CriteriaStateReader = {
  getStepState<T>(stepClass: StepClassType, key?: string): T;
};

/**
 * Centralizes hotel-criteria constants, normalized state, validation, routing,
 * search conversion, and customer-facing rendering.
 */
export class CriteriaHelper {
  /** Room types the conversation and hotel search support. */
  public static readonly ROOM_TYPES = ['one bed', 'two beds', 'suite'] as const;

  /** Amenities the conversation recognizes and sends to the hotel search. */
  public static readonly AMENITIES = [
    'freeWiFi',
    'nonSmoking',
    'freeBreakfast',
    'freeParking',
    'airportShuttle',
    'roomService',
    'fitnessCenter',
    'petFriendly',
    'digitalKey',
    'boutique',
    'onSiteRestaurant',
    'indoorPool',
    'businessCenter',
    'meetingRoom',
    'evCharging',
    'connectingRooms',
    'eveningReception',
    'concierge',
    'streaming',
    'kitchen',
    'tennis',
    'outdoorPool',
    'newHotel',
  ] as const;

  /**
   * Reads each criterion Step's persisted state and returns one normalized
   * snapshot. Unrecognized, missing, and non-finite values become safe defaults.
   */
  public static readCriteria(
    reader: CriteriaStateReader,
  ): HotelCriteriaSnapshot {
    const dates = reader.getStepState<Partial<DateRangeState>>(DateRangeStep);
    const budget = reader.getStepState<Partial<BudgetState>>(BudgetStep);
    const roomType = reader.getStepState<Partial<RoomTypeState>>(RoomTypeStep);
    const amenities = reader.getStepState<Partial<AmenityState>>(AmenityStep);
    const distance = reader.getStepState<Partial<DistanceState>>(DistanceStep);

    return {
      dates: {
        answered: dates.answered === true,
        start: typeof dates.start === 'string' ? dates.start : null,
        end: typeof dates.end === 'string' ? dates.end : null,
      },
      budget: {
        answered: budget.answered === true,
        min: CriteriaHelper.finiteOrNull(budget.min),
        max: CriteriaHelper.finiteOrNull(budget.max),
      },
      roomType: {
        answered: roomType.answered === true,
        roomType: CriteriaHelper.ROOM_TYPES.includes(roomType.roomType as RoomType)
          ? (roomType.roomType as RoomType)
          : null,
      },
      amenities: {
        answered: amenities.answered === true,
        amenities: Array.isArray(amenities.amenities)
          ? amenities.amenities.filter((amenity): amenity is Amenity =>
              CriteriaHelper.AMENITIES.includes(amenity as Amenity),
            )
          : [],
      },
      distance: {
        answered: distance.answered === true,
        airport: CriteriaHelper.finiteOrNull(distance.airport),
        cityCenter: CriteriaHelper.finiteOrNull(distance.cityCenter),
      },
    };
  }

  /** Returns the Step that owns and can revise one named criterion. */
  public static stepForField(field: CriteriaField): StepClassType {
    switch (field) {
      case 'dates':
        return DateRangeStep;
      case 'budget':
        return BudgetStep;
      case 'room_type':
        return RoomTypeStep;
      case 'amenities':
        return AmenityStep;
      case 'distance':
        return DistanceStep;
    }
  }

  /**
   * Returns the owning Step for the first validation issue. Callers must pass
   * a non-empty issue list after checking `issues.length > 0`.
   */
  public static nextStep(issues: readonly CriteriaIssue[]): StepClassType {
    return CriteriaHelper.stepForField(issues[0]!.field);
  }

  /**
   * Applies deterministic business validation to a normalized criterion
   * snapshot. The returned order is also the order used for correction routing.
   */
  public static validateCriteria(
    criteria: HotelCriteriaSnapshot,
  ): CriteriaIssue[] {
    const issues: CriteriaIssue[] = [];

    // Dates must form a future hotel stay.
    if (!criteria.dates.answered) {
      issues.push({ field: 'dates', message: 'Stay dates have not been answered.' });
    } else {
      const start = CriteriaHelper.parseDate(criteria.dates.start);
      const end = CriteriaHelper.parseDate(criteria.dates.end);
      if (!start || !end || end <= start) {
        issues.push({
          field: 'dates',
          message: 'Checkout must be after a valid check-in date.',
        });
      } else if (start <= CriteriaHelper.currentBusinessDate()) {
        issues.push({
          field: 'dates',
          message: 'Check-in must be after the current date.',
        });
      }
    }

    // Either budget limit may be omitted, but supplied values must be valid.
    if (!criteria.budget.answered) {
      issues.push({ field: 'budget', message: 'Nightly budget has not been answered.' });
    } else if (
      (criteria.budget.min !== null && criteria.budget.min < 0) ||
      (criteria.budget.max !== null && criteria.budget.max < 0) ||
      (criteria.budget.min !== null &&
        criteria.budget.max !== null &&
        criteria.budget.min > criteria.budget.max)
    ) {
      issues.push({
        field: 'budget',
        message: 'Budget values must be nonnegative and minimum cannot exceed maximum.',
      });
    }

    // The saved room type must be one supported search value.
    if (!criteria.roomType.answered || !criteria.roomType.roomType) {
      issues.push({ field: 'room_type', message: 'Room type has not been answered.' });
    } else if (!CriteriaHelper.ROOM_TYPES.includes(criteria.roomType.roomType)) {
      issues.push({ field: 'room_type', message: 'Room type is not supported.' });
    }

    // An empty amenities list is an explicit no-preference answer.
    if (!criteria.amenities.answered) {
      issues.push({ field: 'amenities', message: 'Amenity preferences have not been answered.' });
    } else if (
      criteria.amenities.amenities.some(
        (amenity) => !CriteriaHelper.AMENITIES.includes(amenity),
      )
    ) {
      issues.push({ field: 'amenities', message: 'An amenity is not supported.' });
    }

    // Either distance limit may be omitted, but supplied values cannot be negative.
    if (!criteria.distance.answered) {
      issues.push({ field: 'distance', message: 'Distance preferences have not been answered.' });
    } else if (
      (criteria.distance.airport !== null && criteria.distance.airport < 0) ||
      (criteria.distance.cityCenter !== null && criteria.distance.cityCenter < 0)
    ) {
      issues.push({
        field: 'distance',
        message: 'Distance limits must be nonnegative.',
      });
    }

    return issues;
  }

  /**
   * Converts valid normalized criteria into the MCP hotel-pricing request.
   * Invalid criteria fail here as a final deterministic guard.
   */
  public static toSearchRequest(
    criteria: HotelCriteriaSnapshot,
  ): HotelPricingSearchRequest {
    const issues = CriteriaHelper.validateCriteria(criteria);
    if (issues.length > 0) {
      throw new Error(issues.map((issue) => issue.message).join(' '));
    }

    return {
      startDate: criteria.dates.start!,
      endDate: criteria.dates.end!,
      amenities: [...criteria.amenities.amenities],
      roomTypes: [criteria.roomType.roomType!],
      budget: {
        min: criteria.budget.min,
        max: criteria.budget.max,
      },
      maxDistanceMiles: {
        airport: criteria.distance.airport,
        cityCenter: criteria.distance.cityCenter,
      },
    };
  }

  /** Renders the saved criteria for review or correction. */
  public static renderCriteriaSummary(criteria: HotelCriteriaSnapshot): string {
    const budget =
      criteria.budget.min === null && criteria.budget.max === null
        ? 'no preference'
        : `${criteria.budget.min === null ? 'no minimum' : `$${criteria.budget.min}`} to ${criteria.budget.max === null ? 'no maximum' : `$${criteria.budget.max}`}`;
    const amenities =
      criteria.amenities.amenities.length === 0
        ? 'no preference'
        : criteria.amenities.amenities.join(', ');
    const distances = [
      criteria.distance.airport === null
        ? null
        : `airport within ${criteria.distance.airport} miles`,
      criteria.distance.cityCenter === null
        ? null
        : `city center within ${criteria.distance.cityCenter} miles`,
    ].filter((value): value is string => value !== null);

    return [
      'Current Portland hotel criteria:',
      `- Dates: ${criteria.dates.start ?? 'not set'} to ${criteria.dates.end ?? 'not set'}`,
      `- Nightly budget: ${budget}`,
      `- Room type: ${criteria.roomType.roomType ?? 'not set'}`,
      `- Amenities: ${amenities}`,
      `- Distance: ${distances.length === 0 ? 'no preference' : distances.join('; ')}`,
    ].join('\n');
  }

  /** Renders deterministic hotel results when a model draft cannot be used. */
  public static renderHotelResults(hotels: readonly SearchHotelEntry[]): string {
    if (hotels.length === 0) {
      return 'No hotels matched the current criteria. Tell me which criterion to revise.';
    }

    const rows = hotels.map(
      (hotel, index) =>
        `${index + 1}. ${hotel.hotelName} — total ${CriteriaHelper.formatCurrency(hotel.total)}`,
    );
    return [
      'Here are the matching Portland hotels:',
      ...rows,
      '',
      'Reply with a hotel name or number to book, or tell me which search criterion to revise.',
    ].join('\n');
  }

  /** Retains only finite numeric values from persisted state. */
  private static finiteOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  /** Parses a strict YYYY-MM-DD UTC calendar date. */
  private static parseDate(value: string | null): Date | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? date
      : null;
  }

  /** Returns today's UTC midnight, with a testable hotel-business-date override. */
  private static currentBusinessDate(): Date {
    const current = new Date(
      process.env.HOTEL_FLOW_CURRENT_DATE ?? new Date().toISOString(),
    );
    current.setUTCHours(0, 0, 0, 0);
    return current;
  }

  /** Formats a hotel total for customer-facing output. */
  private static formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }
}

/** String union derived from the static room-type list. */
export type RoomType = (typeof CriteriaHelper.ROOM_TYPES)[number];
/** String union derived from the static amenity list. */
export type Amenity = (typeof CriteriaHelper.AMENITIES)[number];
/** Criterion names used for validation issues and routing. */
export type CriteriaField =
  | 'dates'
  | 'budget'
  | 'room_type'
  | 'amenities'
  | 'distance';

export type DateRangeState = {
  answered: boolean;
  start: string | null;
  end: string | null;
};

export type BudgetState = {
  answered: boolean;
  min: number | null;
  max: number | null;
};

export type RoomTypeState = {
  answered: boolean;
  roomType: RoomType | null;
};

export type AmenityState = {
  answered: boolean;
  amenities: Amenity[];
};

export type DistanceState = {
  answered: boolean;
  airport: number | null;
  cityCenter: number | null;
};

/** Normalized criteria collected from the five criterion Steps. */
export type HotelCriteriaSnapshot = {
  dates: DateRangeState;
  budget: BudgetState;
  roomType: RoomTypeState;
  amenities: AmenityState;
  distance: DistanceState;
};

/** A deterministic validation problem and its owning criterion. */
export type CriteriaIssue = {
  field: CriteriaField;
  message: string;
};
