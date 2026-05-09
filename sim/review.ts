// Templated review generator. Plug-replaceable with an LLM call later —
// the function signature is the contract.

import type { Segment } from "./pedestrian.ts";

export interface ReviewInputs {
  productName: string;
  customerName: string;
  waitSeconds: number;
  priceCents: number;
  status: "fulfilled" | "stockout";
  // Load felt by the customer: arrivalIdx / serviceCapacity. >1 = backed up.
  loadRatio: number;
  staffCount: number;
  // For stockout reviews — the ingredient that ran out (e.g. "oat_milk").
  stockoutIngredientName?: string;
}

export interface GeneratedReview {
  stars: number;
  body: string;
}

const QUICK_WAIT_S = 60;
const ACCEPTABLE_WAIT_S = 240;
const PRICEY_CENTS = 700;
const VERY_PRICEY_CENTS = 1000;

const WAIT_PHRASES = {
  quick: ["served in no time", "barely a wait", "quick turnaround"],
  ok: ["reasonable queue", "didn't wait long", "moved through promptly"],
  slow: ["queue was longer than expected", "wait dragged on", "took a while"],
};

const QUALITY_PHRASES = {
  great: ["nicely pulled shot", "well-balanced flavor", "solid pour"],
  ok: ["decent enough cup", "did the job", "fine for a midtown stop"],
  meh: ["nothing remarkable", "underwhelming for the price", "average at best"],
  bad: ["bitter and burnt", "weak and watery", "not what I ordered"],
};

const PRICE_PHRASES_PRICEY = [
  "a bit steep",
  "Times Square markup is real",
  "paid the tourist tax",
];

const STAFFING_PHRASES = [
  "looked overwhelmed back there",
  "barista was clearly slammed",
  "single barista juggling everyone",
  "shop felt understaffed",
];

const STOCKOUT_PHRASES = [
  "they were out of {ing}, had to switch up my order",
  "out of {ing} again",
  "no {ing} on the day I came in",
  "told they didn't have {ing}, walked",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateReview(input: ReviewInputs, segment: Segment): GeneratedReview {
  if (input.status === "stockout") {
    return generateStockoutReview(input);
  }
  return generateFulfilledReview(input, segment);
}

function generateStockoutReview(input: ReviewInputs): GeneratedReview {
  // Stockout reviewers are annoyed. Base 2.5, drop further if they waited a
  // long time before being told no, with sub-integer noise for a 1–4 spread.
  let stars = 2.5;
  if (input.waitSeconds > 180) stars -= 1;
  if (Math.random() < 0.20) stars -= 1; // grumpier customer
  else if (Math.random() < 0.20) stars += 1; // resigned, "it happens"
  stars += (Math.random() - 0.5) * 0.6;
  stars = Math.max(1, Math.min(5, Math.round(stars)));

  const ing = (input.stockoutIngredientName ?? "an ingredient").replace(/_/g, " ");
  const phrase = pick(STOCKOUT_PHRASES).replace("{ing}", ing);
  const tail = stars <= 2
    ? "Won't be back any time soon."
    : "Hopefully sorted next time.";
  const body = `${capitalize(phrase)} on a ${input.productName.toLowerCase()}. ${tail}`;
  return { stars, body };
}

function generateFulfilledReview(input: ReviewInputs, segment: Segment): GeneratedReview {
  let stars = 4.7;

  if (input.waitSeconds <= 30) stars += 0.5;
  else if (input.waitSeconds <= QUICK_WAIT_S) stars += 0.2;
  else if (input.waitSeconds > ACCEPTABLE_WAIT_S) stars -= 1.2;
  else if (input.waitSeconds > 120) stars -= 0.2;

  // Quality: skewed positive with rare disasters so 1–2 star reviews exist
  // but don't dominate.
  const qualityRoll = Math.random();
  let qualityBucket: "great" | "ok" | "meh" | "bad" = "ok";
  if (qualityRoll < 0.03) { stars -= 2; qualityBucket = "bad"; }
  else if (qualityRoll < 0.10) { stars -= 1; qualityBucket = "meh"; }
  else if (qualityRoll > 0.75) { stars += 0.3; qualityBucket = "great"; }

  // Load / understaffing: flavor, not the dominant factor.
  let staffingFlag = false;
  if (input.loadRatio > 1.5) { stars -= 0.5; staffingFlag = true; }
  else if (input.loadRatio > 1.0) { stars -= 0.2; staffingFlag = true; }
  if (input.staffCount === 1 && input.loadRatio > 0.7 && Math.random() < 0.2) {
    stars -= 0.3;
    staffingFlag = true;
  }

  // Sub-integer noise so identical situations spread across integers.
  stars += (Math.random() - 0.5) * 0.6;

  if (input.priceCents > PRICEY_CENTS && Math.random() < 0.25) stars -= 1;
  if (input.priceCents > VERY_PRICEY_CENTS && Math.random() < 0.4) stars -= 1;

  stars = Math.max(1, Math.min(5, Math.round(stars)));

  const waitBucket =
    input.waitSeconds <= QUICK_WAIT_S ? "quick" :
    input.waitSeconds <= ACCEPTABLE_WAIT_S ? "ok" : "slow";

  const parts: string[] = [
    `${pick(WAIT_PHRASES[waitBucket])} on the ${input.productName.toLowerCase()}`,
    pick(QUALITY_PHRASES[qualityBucket]),
  ];
  if (staffingFlag && Math.random() < 0.5) parts.push(pick(STAFFING_PHRASES));
  if (input.priceCents > PRICEY_CENTS && Math.random() < 0.5) {
    parts.push(pick(PRICE_PHRASES_PRICEY));
  }

  const body = `${capitalize(parts.join(", "))}. ${segment === "morning" ? "Good before-work stop." : segment === "night" ? "Quiet at this hour." : ""}`.trim();
  return { stars, body };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
