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
const PRICEY_CENTS = 700;       // NYC base latte is ~$5.75; tax kicks in above ~$7
const VERY_PRICEY_CENTS = 1000; // stacked tax above ~$10

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
  // Stars: most cups land at 4–5; quality occasionally drags one to 2–3.
  // Pricing tax stacks above $7 (premium) and $10 (luxury) so premium teams
  // get pulled lower than cheap teams without flattening everyone.
  let stars = 4;
  if (input.waitSeconds <= 30) stars += 1;
  else if (input.waitSeconds <= QUICK_WAIT_S) stars += 0.5;
  else if (input.waitSeconds > ACCEPTABLE_WAIT_S) stars -= 2;
  else if (input.waitSeconds > 120) stars -= 0.5;

  // Quality: bidirectional with rare disasters so 1- and 2-star reviews exist.
  const qualityRoll = Math.random();
  if (qualityRoll < 0.05) stars -= 2;
  else if (qualityRoll < 0.18) stars -= 1;
  else if (qualityRoll > 0.85) stars += 1;

  // Sub-integer noise so identical situations don't all round the same way.
  stars += (Math.random() - 0.5) * 0.6;

  if (input.priceCents > PRICEY_CENTS && Math.random() < 0.4) stars -= 1;
  if (input.priceCents > VERY_PRICEY_CENTS && Math.random() < 0.6) stars -= 1;

  stars = Math.max(1, Math.min(5, Math.round(stars)));

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
