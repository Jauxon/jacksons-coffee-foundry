// Twitter/X uses the same card as Open Graph. Route-segment config fields must
// be static literals (Next can't parse re-exported ones), so declare them here
// and reuse only the render function.
import OGImage from "./opengraph-image.tsx";

export const runtime = "nodejs";
export const alt = "Operator — an AI-native ops manager";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default OGImage;
