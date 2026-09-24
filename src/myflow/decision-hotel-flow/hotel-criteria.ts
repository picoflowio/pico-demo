import type { HotelPricingSearchRequest } from '../../tools/hotel-pricing-contract.js';
import type { SearchHotelEntry } from '../hotel-flow/backend/pricing-engine.js';

export const ROOM_TYPES = ['one bed', 'two beds', 'suite'] as const;

export const AMENITIES = [
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

export type RoomType = (typeof ROOM_TYPES)[number];
export type Amenity = (typeof AMENITIES)[number];
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

export type HotelCriteriaSnapshot = {
  dates: DateRangeState;
  budget: BudgetState;
  roomType: RoomTypeState;
  amenities: AmenityState;
  distance: DistanceState;
};

export type CriteriaIssue = {
  field: CriteriaField;
  message: string;
};

export function validateCriteria(
  criteria: HotelCriteriaSnapshot,
): CriteriaIssue[] {
  const issues: CriteriaIssue[] = [];

  if (!criteria.dates.answered) {
    issues.push({ field: 'dates', message: 'Stay dates have not been answered.' });
  } else {
    const start = parseDate(criteria.dates.start);
    const end = parseDate(criteria.dates.end);
    if (!start || !end || end <= start) {
      issues.push({
        field: 'dates',
        message: 'Checkout must be after a valid check-in date.',
      });
    } else if (start <= currentBusinessDate()) {
      issues.push({
        field: 'dates',
        message: 'Check-in must be after the current date.',
      });
    }
  }

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

  if (!criteria.roomType.answered || !criteria.roomType.roomType) {
    issues.push({ field: 'room_type', message: 'Room type has not been answered.' });
  } else if (!ROOM_TYPES.includes(criteria.roomType.roomType)) {
    issues.push({ field: 'room_type', message: 'Room type is not supported.' });
  }

  if (!criteria.amenities.answered) {
    issues.push({ field: 'amenities', message: 'Amenity preferences have not been answered.' });
  } else if (
    criteria.amenities.amenities.some(
      (amenity) => !AMENITIES.includes(amenity),
    )
  ) {
    issues.push({ field: 'amenities', message: 'An amenity is not supported.' });
  }

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

export function toSearchRequest(
  criteria: HotelCriteriaSnapshot,
): HotelPricingSearchRequest {
  const issues = validateCriteria(criteria);
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

export function renderCriteriaSummary(criteria: HotelCriteriaSnapshot): string {
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

export function renderHotelResults(hotels: readonly SearchHotelEntry[]): string {
  if (hotels.length === 0) {
    return 'No hotels matched the current criteria. Tell me which criterion you want to revise.';
  }

  const rows = hotels.map(
    (hotel, index) =>
      `${index + 1}. ${hotel.hotelName} — total ${formatCurrency(hotel.total)}`,
  );
  return [
    'Here are the matching Portland hotels:',
    ...rows,
    '',
    'Reply with a hotel name or number to book, or tell me which search criterion to revise.',
  ].join('\n');
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

function currentBusinessDate(): Date {
  const current = new Date(
    process.env.HOTEL_FLOW_CURRENT_DATE ?? new Date().toISOString(),
  );
  current.setUTCHours(0, 0, 0, 0);
  return current;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}
