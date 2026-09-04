import { createFileRoute } from "@tanstack/react-router";
import { GameCanvas } from "@/components/game/GameCanvas";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Koleo Island — 3D Fishing Game" },
      {
        name: "description",
        content:
          "A 3D fishing game: cast from a tiny island pier into the open ocean, wait for a bite, then reel in the catch.",
      },
      { property: "og:title", content: "Koleo Island — 3D Fishing Game" },
      {
        property: "og:description",
        content:
          "Cast your line, feel the bite, and haul in blocky fish across a changing sea.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GameCanvas,
});
