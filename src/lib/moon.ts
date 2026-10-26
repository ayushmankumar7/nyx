// Lunar phase from the mean synodic month — accurate to within a few hours,
// which is plenty for a phase name and illumination percentage.

const SYNODIC = 29.530588853;
const KNOWN_NEW = Date.UTC(2000, 0, 6, 18, 14);
const DAY = 86_400_000;

export type Phase = {
  /** 0 = new, 0.5 = full */
  fraction: number;
  illumination: number;
  name: string;
  daysToFull: number;
};

const NAMES: [number, string][] = [
  [0.033, "New Moon"],
  [0.217, "Waxing Crescent"],
  [0.283, "First Quarter"],
  [0.467, "Waxing Gibbous"],
  [0.533, "Full Moon"],
  [0.717, "Waning Gibbous"],
  [0.783, "Last Quarter"],
  [0.967, "Waning Crescent"],
  [1, "New Moon"],
];

export function phase(at = Date.now()): Phase {
  const days = (at - KNOWN_NEW) / DAY;
  const fraction = (((days / SYNODIC) % 1) + 1) % 1;
  return {
    fraction,
    illumination: (1 - Math.cos(2 * Math.PI * fraction)) / 2,
    name: NAMES.find(([end]) => fraction < end)![1],
    daysToFull: ((0.5 - fraction + 1) % 1) * SYNODIC,
  };
}

/** SVG path of the sunlit part of a moon of radius r centred at the origin. */
export function litPath(fraction: number, r: number) {
  const rx = r * Math.abs(Math.cos(2 * Math.PI * fraction));
  const waxing = fraction < 0.5;
  const crescent = fraction < 0.25 || fraction > 0.75;
  const limb = waxing ? 1 : 0;
  const terminator = waxing === crescent ? 0 : 1;
  return `M0 ${-r} A${r} ${r} 0 0 ${limb} 0 ${r} A${rx} ${r} 0 0 ${terminator} 0 ${-r}Z`;
}
