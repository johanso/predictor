import { describe, it, expect } from "vitest";
import { computeConfidence } from "@/lib/poisson/confidence";

const HOUR = 60 * 60 * 1000;

describe("computeConfidence", () => {
  it("is alta with plenty of matches and fresh data", () => {
    const c = computeConfidence(10, 10, new Date(Date.now() - 1 * HOUR));
    expect(c.level).toBe("alta");
    expect(c.warnings).toEqual([]);
  });

  it("drops to media just below the 10-match sample threshold", () => {
    const c = computeConfidence(9, 10, new Date(Date.now() - 1 * HOUR));
    expect(c.level).toBe("media");
    expect(c.warnings.length).toBe(1);
  });

  it("drops to baja below the 5-match sample threshold", () => {
    const c = computeConfidence(4, 10, new Date(Date.now() - 1 * HOUR));
    expect(c.level).toBe("baja");
    expect(c.warnings).toContain("La predicción se basa en una muestra limitada y puede ser menos fiable.");
  });

  it("is alta right at the 6h freshness boundary", () => {
    const c = computeConfidence(10, 10, new Date(Date.now() - 6 * HOUR));
    expect(c.level).toBe("alta");
  });

  it("drops to media just past the 6h freshness boundary", () => {
    const c = computeConfidence(10, 10, new Date(Date.now() - (6 * HOUR + 60 * 1000)));
    expect(c.level).toBe("media");
  });

  it("is media right at the 24h freshness boundary", () => {
    const c = computeConfidence(10, 10, new Date(Date.now() - 24 * HOUR));
    expect(c.level).toBe("media");
  });

  it("drops to baja just past the 24h freshness boundary", () => {
    const c = computeConfidence(10, 10, new Date(Date.now() - (24 * HOUR + 60 * 1000)));
    expect(c.level).toBe("baja");
    expect(c.warnings).toContain("Los datos de este equipo tienen más de 24 horas de antigüedad.");
  });

  it("is baja when fetchedAt is null", () => {
    const c = computeConfidence(10, 10, null);
    expect(c.level).toBe("baja");
    expect(c.dataAgeHours).toBeNull();
  });

  it("overall level is the worse of the two tiers", () => {
    const c = computeConfidence(3, 10, new Date(Date.now() - 1 * HOUR));
    expect(c.level).toBe("baja");
  });
});
