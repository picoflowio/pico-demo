/*
 * Created on Mon Feb 02 2026
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */

import { z } from 'zod';

export const TravelPlanSchema = z.object({
  user_intent: z.enum([
    'full_plan',
    'flights_only',
    'hotels_only',
    'activities_only',
  ]),
  origin: z.string().describe('Starting location'),
  destination: z.string().describe('Final destination'),
  departure_date: z.date().describe('US date format preferred'),
  return_date: z.date().describe('US date format preferred'),
  duration_days: z.number().describe('Number of days'),
  adults: z.number().default(1),
  travel_class: z.string().default('ECONOMY'),
  budget: z.number().optional().describe('Total budget'),
});

export type TravelPlan = z.infer<typeof TravelPlanSchema>;

export const FlightOptionSchema = z.object({
  id: z.string(),
  airline: z.string(),
  price: z.number(),
  departure_time: z.string(),
  arrival_time: z.string(),
});

export type FlightOption = z.infer<typeof FlightOptionSchema>;

export const HotelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  price_per_night: z.number(),
  rating: z.number(),
  location: z.string(),
});

export type HotelOption = z.infer<typeof HotelOptionSchema>;

export const ActivityOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  duration: z.string(),
  description: z.string(),
});

export type ActivityOption = z.infer<typeof ActivityOptionSchema>;

export const TravelPackageSchema = z.object({
  name: z.string().describe('Creative package name'),
  flight: FlightOptionSchema,
  hotel: HotelOptionSchema,
  activities: z.array(ActivityOptionSchema),
  total_cost: z.number(),
  budget_comment: z.string(),
});

export type TravelPackage = z.infer<typeof TravelPackageSchema>;
