"use client";

import dynamic from "next/dynamic";
import type { ShopMarker } from "./ShopMap.tsx";

// Lazy-load the leaflet wrapper from inside a client component so SSR is skipped.
const ShopMap = dynamic(() => import("./ShopMap.tsx").then((m) => m.ShopMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-cream-200 animate-pulse" />,
});

export function ShopMapClient(props: { markers: ShopMarker[]; center: { lat: number; lng: number }; zoom?: number }) {
  return <ShopMap {...props} />;
}
