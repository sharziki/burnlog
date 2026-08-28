/** The real ladder, mirrored from web/src/lib/ranks.ts. Not invented for the film. */
export const RANKS = [
  { name: "Spark", min: "0", color: "#52525B", icon: "○" },
  { name: "Ember", min: "100.0K", color: "#D97706", icon: "◐" },
  { name: "Blaze", min: "500.0K", color: "#F59E0B", icon: "●" },
  { name: "Inferno", min: "2.0M", color: "#EF4444", icon: "◉" },
  { name: "Supernova", min: "10.0M", color: "#A855F7", icon: "✦" },
  { name: "Quasar", min: "100.0M", color: "#60A5FA", icon: "✧" },
  { name: "Singularity", min: "1.0B", color: "#22D3EE", icon: "◆" },
  { name: "Event Horizon", min: "10.0B", color: "#FAFAFA", icon: "◈" },
  { name: "Heat Death", min: "100.0B", color: "#F472B6", icon: "∞" },
  { name: "Vacuum Decay", min: "1.0T", color: "#E879F9", icon: "★" },
  { name: "Boltzmann", min: "10.0T", color: "#FDE68A", icon: "✶" },
] as const;
