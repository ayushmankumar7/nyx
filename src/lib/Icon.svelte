<script lang="ts" module>
  // 24×24 stroke icons, drawn to sit comfortably next to Jost.
  const paths = {
    home: "M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
    mirror: "M12 21c4.4 0 7-3.6 7-9s-2.6-9-7-9-7 3.6-7 9 2.6 9 7 9zM9 9.5c.5-1.2 1.4-2 2.6-2.3",
    moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
    play: "M8 5.5v13l10.5-6.5z",
    pause: "M8 5h3v14H8zM13 5h3v14h-3z",
    next: "M5 6v12l8.5-6zM13.5 6v12l8.5-6z",
    prev: "M19 6v12l-8.5-6zM10.5 6v12L2 12z",
    speaker: "M4 9.5h3.5L12 6v12l-4.5-3.5H4z",
    wave1: "M15.5 9.5a3.5 3.5 0 0 1 0 5",
    wave2: "M18 7a7 7 0 0 1 0 10",
    mute: "M16 9.5l5 5M21 9.5l-5 5",
    bolt: "M13 3 6 13.5h5L10 21l7-10.5h-5z",
    camera: "M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM15 10.5l5.5-3v9l-5.5-3",
    chevron: "M6 9l6 6 6-6",
    pin: "M9 4h6l-1 6 3 3H7l3-3zM12 13v7",
    cloud: "M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.5 4.25 4.25 0 0 0 7 18z",
    rain: "M7 14h10a3.5 3.5 0 0 0 .5-6.96A5.5 5.5 0 0 0 6.6 7 3.5 3.5 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3",
    snow: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5",
    leaf: "M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l8-8",
    fog: "M4 9h16M3 13h18M5 17h14",
    sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    wind: "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7",
    shuffle: "M16 4h4v4M4 20 20 4M20 16v4h-4M15 15l5 5M4 4l5 5",
    location: "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    depth: "M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4",
    todo: "M4 6.5l1.5 1.5L8 5.5M4 12.5l1.5 1.5L8 11.5M4 18.5l1.5 1.5L8 17.5M11.5 7H20M11.5 13H20M11.5 19H20",
  } as const;
  export type IconName = keyof typeof paths;
  const filled = new Set<IconName>(["play", "pause", "next", "prev", "bolt"]);
</script>

<script lang="ts">
  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled.has(name) ? "currentColor" : "none"}
  stroke={filled.has(name) ? "none" : "currentColor"}
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name]} />
</svg>
