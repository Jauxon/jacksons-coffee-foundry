import { tick } from "../sim/tick.ts";

const n = Number(process.argv[2] ?? 1);
if (!Number.isFinite(n) || n < 1) {
  console.error("usage: npm run tick -- <n>");
  process.exit(1);
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pad = (s: string, n: number) => s.padEnd(n);

console.log(
  pad("day", 4) + pad("seg", 9) + pad("arr", 6) +
  pad("shop", 24) + pad("ful", 5) + pad("stk", 5) +
  pad("rev", 10) + pad("cogs", 9) + pad("cash", 12),
);

for (let i = 0; i < n; i++) {
  const r = tick();
  for (const sh of r.perShop) {
    console.log(
      pad(String(r.day), 4) +
      pad(r.segment, 9) +
      pad(String(sh.arrivals), 6) +
      pad(sh.shopName, 24) +
      pad(String(sh.fulfilled), 5) +
      pad(String(sh.stockouts), 5) +
      pad(fmt(sh.revenueCents), 10) +
      pad(fmt(sh.cogsCents), 9) +
      pad(fmt(sh.cashAfterCents), 12),
    );
  }
  console.log("");
}
