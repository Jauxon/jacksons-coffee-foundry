import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Operator — an AI-native ops manager",
    short_name: "Operator",
    description: "An AI agent that runs a small business and hands every decision to a human for approval.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF6EF",
    theme_color: "#6F4E37",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
