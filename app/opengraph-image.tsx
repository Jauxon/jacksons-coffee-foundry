import { ImageResponse } from "next/og";

// Branded social preview card. Rendered server-side via Satori. No DB access
// (so it can never break the build); purely the brand + pitch. Once a domain is
// set we can make this pull live standings.
export const runtime = "nodejs";
export const alt = "Operator — an AI-native ops manager";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #FBF6EF 0%, #F1E4D2 100%)",
          padding: "72px 80px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#6F4E37",
              color: "#FFF8F0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            O
          </div>
          <div style={{ fontSize: 26, color: "#8B6F47", letterSpacing: 2, textTransform: "uppercase" }}>
            CS 153 · One-Person Frontier Lab
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, color: "#3B2A1E", lineHeight: 1.05 }}>
            Operator
          </div>
          <div style={{ fontSize: 40, color: "#6F4E37", marginTop: 8 }}>
            an AI-native ops manager
          </div>
          <div style={{ fontSize: 26, color: "#7A6A58", marginTop: 22, maxWidth: 900, lineHeight: 1.4 }}>
            A Claude agent runs a business and hands every decision to a human for approval.
            Five storefronts compete on Times Square.
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, fontSize: 22, color: "#8B6F47" }}>
          <span>Opus 4.7 · tool use · prompt caching</span>
          <span>·</span>
          <span>heuristic + LLM agents</span>
          <span>·</span>
          <span>live cost ledger</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
