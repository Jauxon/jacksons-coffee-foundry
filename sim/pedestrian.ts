// Pedestrian flow model for a Times Square storefront.
//
// Anchor numbers (Times Square Alliance public reports, 2023-2024):
//   - ~330,000 pedestrians/day average on the Bowtie (Broadway/7th, 42nd-47th)
//   - Peak hours hit 50k+; trough hours (3-5am) drop below 5k
//   - Father Duffy / TKTS steps see the densest flow on the bowtie
//
// The sim uses 4 segments × 6 hours. The fractions below are derived from
// publicly reported hourly distributions and reproduce the well-known
// "double hump" — commute morning, lunch midday, theater/dinner evening,
// and a long sparse overnight tail.

export type Segment = "morning" | "midday" | "evening" | "night";

export const SEGMENT_ORDER: Segment[] = ["morning", "midday", "evening", "night"];

// Pedestrians passing the bowtie per segment (mean of a Poisson). Sums to ~330k/day.
export const PED_FLOW_PER_SEGMENT: Record<Segment, number> = {
  morning: 82_000,
  midday: 115_000,
  evening: 99_000,
  night: 34_000,
};

// Fraction of passing pedestrians who *want* coffee right now.
export const COFFEE_INTENT_BY_SEGMENT: Record<Segment, number> = {
  morning: 0.075, // commuter rush — strong coffee pull
  midday: 0.030,
  evening: 0.015,
  night: 0.005,
};

// ---------- Multi-team capture model ----------
// In a multi-shop world, the *total* number of intent customers is a property
// of the location (not any single shop). Shops compete for that pool. Each
// customer picks a shop using a relative score; we softmax over scores below.

interface ShopCaptureInputs {
  avgStars: number | null;
  menuPriceIndexCents: number;
  priceSensitivity: number; // customer attribute
}

// Score for shop attractiveness given a customer's price sensitivity.
// Used as the *weight* in a softmax pick — a shop with 2x score gets
// 2x the share of arrivals.
export function shopCaptureScore(x: ShopCaptureInputs): number {
  // Sentiment: 1-star → 0.6x, 5-star → 1.6x, no reviews → neutral
  const sentiment = x.avgStars == null ? 1.0 : 0.5 + 0.22 * x.avgStars;
  // Price: customer with sensitivity ~0.5 sees a 20% price hike as 30% less attractive.
  const reference = 400; // $4 reference
  const ratio = x.menuPriceIndexCents / reference;
  const elasticity = 1.0 + 1.5 * x.priceSensitivity; // 1.0..2.5
  const price = Math.pow(ratio, -elasticity);
  return Math.max(0.001, sentiment * price);
}

// ---------- Service capacity (per shop, per segment) ----------

export function serviceCapacityPerSegment(staffCount: number): number {
  const drinksPerStaffPerSegment = 200;
  return staffCount * drinksPerStaffPerSegment;
}

export function expectedWaitSeconds(
  arrivalIndex: number,
  arrivalsThisSegment: number,
  capacity: number,
): number {
  const segmentSeconds = 6 * 3600;
  if (arrivalsThisSegment <= capacity) {
    return 30 + 10 * (arrivalsThisSegment / Math.max(capacity, 1));
  }
  const overflow = Math.max(0, arrivalIndex - capacity);
  const perCustomerService = segmentSeconds / capacity;
  return 30 + overflow * perCustomerService;
}
