import {
  IMPACT_DISCLAIMER,
  equivalents,
  formatCo2e,
  formatEnergy,
  formatWater,
  impactOf,
} from "@/lib/impact";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Environmental cost of a token total.
 *
 * Shown next to the dollar figure because they're the same question asked two
 * ways: what did this burn actually cost? The disclaimer is not optional —
 * these are estimates from public averages, and presenting them as anything
 * firmer would be dishonest.
 */
export function ImpactPanel({
  tokens,
  title = "Environmental impact",
  compact,
}: {
  tokens: number;
  title?: string;
  compact?: boolean;
}) {
  const impact = impactOf(tokens);
  const eq = equivalents(impact);

  const stats = [
    { label: "energy", value: formatEnergy(impact.kwh), color: "#F59E0B" },
    { label: "CO₂e", value: formatCo2e(impact.gCo2e), color: "#E4E4E7" },
    { label: "water", value: formatWater(impact.litres), color: "#60A5FA" },
  ];

  if (compact) {
    return (
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontFamily: MONO, fontSize: 11 }}>
        {stats.map((s) => (
          <span key={s.label} style={{ color: "#52525B" }}>
            <span style={{ color: s.color, fontWeight: 700 }}>{s.value}</span> {s.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{ background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 10, padding: 20 }}>
      <div
        style={{
          fontSize: 11,
          color: "#52525B",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontFamily: MONO,
          marginBottom: 16,
        }}
      >
        {title}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label}>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: s.color }}>
              {s.value}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#52525B", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: "#18181B", margin: "16px 0" }} />

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {eq.map((e) => (
          <div key={e.label} style={{ fontFamily: MONO, fontSize: 11 }}>
            <span style={{ color: "#A1A1AA", fontWeight: 700 }}>{e.value}</span>{" "}
            <span style={{ color: "#52525B" }}>{e.label}</span>
          </div>
        ))}
      </div>

      <p style={{ margin: "14px 0 0", fontFamily: MONO, fontSize: 10, color: "#3F3F46", lineHeight: 1.6 }}>
        {IMPACT_DISCLAIMER}
      </p>
    </div>
  );
}
