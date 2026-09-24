import type { StepClassType } from '@picoflow/core';
import { AmenityStep } from './amenity-step.js';
import { BudgetStep } from './budget-step.js';
import { DateRangeStep } from './date-range-step.js';
import { DistanceStep } from './distance-step.js';
import {
  AMENITIES,
  ROOM_TYPES,
  type Amenity,
  type AmenityState,
  type BudgetState,
  type CriteriaField,
  type DateRangeState,
  type DistanceState,
  type HotelCriteriaSnapshot,
  type RoomType,
  type RoomTypeState,
} from './hotel-criteria.js';
import { RoomTypeStep } from './room-type-step.js';

type CriteriaStateReader = {
  getStepState<T>(stepClass: StepClassType, key?: string): T;
};

export function readCriteria(
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
      min: finiteOrNull(budget.min),
      max: finiteOrNull(budget.max),
    },
    roomType: {
      answered: roomType.answered === true,
      roomType: ROOM_TYPES.includes(roomType.roomType as RoomType)
        ? (roomType.roomType as RoomType)
        : null,
    },
    amenities: {
      answered: amenities.answered === true,
      amenities: Array.isArray(amenities.amenities)
        ? amenities.amenities.filter((amenity): amenity is Amenity =>
            AMENITIES.includes(amenity as Amenity),
          )
        : [],
    },
    distance: {
      answered: distance.answered === true,
      airport: finiteOrNull(distance.airport),
      cityCenter: finiteOrNull(distance.cityCenter),
    },
  };
}

export function stepForField(field: CriteriaField): StepClassType {
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

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
