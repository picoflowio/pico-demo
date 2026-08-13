/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { z } from 'zod';

export const HOTEL_PRICING_MCP_TOOL = 'search_hotels';

const NullableNumber = z.number().finite().nullable();

export const HotelSearchCriteriaSchema = z
  .object({
    currentDate: z.string().nullable().optional(),
    amenities: z.array(z.string()).optional(),
    roomType: z.array(z.string()).optional(),
    cAmenities: z.array(z.string()),
    cRoomType: z.array(z.string()),
    cPriceRange: z.object({
      min: NullableNumber,
      max: NullableNumber,
    }),
    cDistance: z.object({
      cityCenter: NullableNumber,
      airport: NullableNumber,
    }),
    cDate: z.object({
      start: z.string().min(1),
      end: z.string().min(1),
    }),
    cDateArray: z.array(z.string()),
  });

export type HotelSearchCriteria = z.infer<typeof HotelSearchCriteriaSchema>;

export const HotelPricingSearchRequestSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  amenities: z.array(z.string()),
  roomTypes: z.array(z.string()),
  budget: z.object({
    min: NullableNumber,
    max: NullableNumber,
  }),
  maxDistanceMiles: z.object({
    airport: NullableNumber,
    cityCenter: NullableNumber,
  }),
});

export type HotelPricingSearchRequest = z.infer<
  typeof HotelPricingSearchRequestSchema
>;

export const HotelPricingSearchResultSchema = z.object({
  hotelName: z.string(),
  prices: z.array(z.number().finite()),
  total: z.number().finite(),
});

export const HotelPricingSearchResponseSchema = z.object({
  hotels: z.array(HotelPricingSearchResultSchema),
});

export type HotelPricingSearchResponse = z.infer<
  typeof HotelPricingSearchResponseSchema
>;

export function toHotelPricingSearchRequest(
  criteria: HotelSearchCriteria,
): HotelPricingSearchRequest {
  return {
    startDate: criteria.cDate.start,
    endDate: criteria.cDate.end,
    amenities: criteria.cAmenities,
    roomTypes: criteria.cRoomType,
    budget: criteria.cPriceRange,
    maxDistanceMiles: criteria.cDistance,
  };
}
