// Templated review generator. Plug-replaceable with an LLM call later —
// the function signature is the contract.

import type { Segment } from "./pedestrian.ts";

export interface ReviewInputs {
  productName: string;
  customerName: string;
  waitSeconds: number;
  priceCents: number;
  status: "fulfilled";
}

export interface GeneratedReview {
  stars: number;
  body: string;
}

const QUICK_WAIT_S = 60;
const ACCEPTABLE_WAIT_S = 240;
const PRICEY_CENTS = 500;

const WAIT_PHRASES = {
  quick: ["served in no time", "barely a wait", "quick turnaround"],
  ok: ["reasonable queue", "didn't wait long", "moved through promptly"],
  slow: ["queue was longer than expected", "wait dragged on", "took a while"],
};

const QUALITY_PHRASES = {
  great: ["nicely pulled shot", "well-balanced flavor", "solid pour"],
  ok: ["decent enough cup", "did the job", "fine for a midtown stop"],
  meh: ["nothing remarkable", "underwhelming for the price", "average at best"],
};

const PRICE_PHRASES_PRICEY = [
  "a bit steep",
  "Times Square markup is real",
  "paid the tourist tax",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateReview(input: ReviewInputs, segment: Segment): GeneratedReview {
  // Stars: start at 4, penalize wait, modest random quality variance, price tax.
  let stars = 4;
  if (input.waitSeconds <= QUICK_WAIT_S) stars += 1;
  else if (input.waitSeconds > ACCEPTABLE_WAIT_S) stars -= 2;

  const qualityRoll = Math.random();
  if (qualityRoll > 0.85) stars += 1;
  else if (qualityRoll < 0.15) stars -= 1;

  if (input.priceCents > PRICEY_CENTS && Math.random() < 0.4) stars -= 1;
  stars = Math.max(1, Math.min(5, stars));

  const waitBucket =
    input.waitSeconds <= QUICK_WAIT_S ? "quick" :
    input.waitSeconds <= ACCEPTABLE_WAIT_S ? "ok" : "slow";
  const qualityBucket =
    stars >= 5 ? "great" :
    stars >= 3 ? "ok" : "meh";

  const parts: string[] = [
    `${pick(WAIT_PHRASES[waitBucket])} on the ${input.productName.toLowerCase()}`,
    pick(QUALITY_PHRASES[qualityBucket]),
  ];
  if (input.priceCents > PRICEY_CENTS && Math.random() < 0.5) {
    parts.push(pick(PRICE_PHRASES_PRICEY));
  }

  const body = `${capitalize(parts.join(", "))}. ${segment === "morning" ? "Good before-work stop." : segment === "night" ? "Quiet at this hour." : ""}`.trim();
  return { stars, body };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
