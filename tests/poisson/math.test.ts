import { describe, it, expect } from "vitest";
import { poissonPmf, toOdds } from "@/lib/poisson/math";

describe("poissonPmf", () => {
  it("matches known Poisson values for lambda=1.626969696969697 (k=0..3)", () => {
    const lambda = 1.626969696969697;
    // Excel POISSON.DIST(k, lambda, FALSE) reference values from the workbook's Poisson!E2:H2
    expect(poissonPmf(0, lambda)).toBeCloseTo(0.19652420060329398, 6);
    expect(poissonPmf(1, lambda)).toBeCloseTo(0.3197389191027531, 6);
    expect(poissonPmf(2, lambda)).toBeCloseTo(0.2601027661610124, 6);
    expect(poissonPmf(3, lambda)).toBeCloseTo(0.14105977288065408, 6);
  });

  it("returns 1 at k=0 and 0 elsewhere for lambda=0", () => {
    expect(poissonPmf(0, 0)).toBe(1);
    expect(poissonPmf(1, 0)).toBe(0);
  });
});

describe("toOdds", () => {
  it("inverts probability", () => {
    expect(toOdds(0.5)).toBe(2);
  });

  it("returns null for zero probability", () => {
    expect(toOdds(0)).toBeNull();
  });
});
