import { describe, it, expect } from "vitest";
import { tau, applyDixonColesAdjustment, clampRho, rhoBounds, DEFAULT_RHO } from "@/lib/poisson/dixonColes";
import { buildProbabilityMatrix } from "@/lib/poisson/markets";

describe("rhoBounds", () => {
  // The bound that matters, and the one that is easy to get backwards: the ceiling
  // comes from tau(0,0) = 1 - lambda*mu*rho, so it scales with the PRODUCT of the
  // rates, while the floor comes from tau(0,1)/tau(1,0) and scales with the LARGER
  // of them. Swapping the two lets rho climb high enough to make a 0-0 negative.
  it("derives the ceiling from the product of the rates", () => {
    expect(rhoBounds(2.0, 1.5).max).toBeCloseTo(1 / 3.0, 10);
  });

  it("derives the floor from the larger rate", () => {
    expect(rhoBounds(2.0, 1.5).min).toBeCloseTo(-1 / 2.0, 10);
  });

  it("keeps every corrected cell positive across a wide range of matchups", () => {
    for (const lambda of [0.4, 1.0, 1.7, 2.6, 3.5]) {
      for (const mu of [0.3, 0.9, 1.6, 2.4, 3.2]) {
        const { min, max } = rhoBounds(lambda, mu);
        for (const rho of [min, max, (min + max) / 2]) {
          for (const [x, y] of [
            [0, 0],
            [0, 1],
            [1, 0],
            [1, 1],
          ]) {
            expect(tau(x, y, lambda, mu, rho)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("pulls an out-of-range rho back inside", () => {
    // 0.5 is fine for a low-scoring matchup but impossible for a high-scoring one.
    expect(clampRho(0.5, 1.0, 1.0)).toBeCloseTo(0.5, 10);
    expect(clampRho(0.5, 3.0, 2.5)).toBeCloseTo(1 / 7.5, 10);
    expect(clampRho(-5, 2.0, 1.5)).toBeCloseTo(-0.5, 10);
  });
});

describe("tau", () => {
  it("is 1 outside the 4 special cells", () => {
    expect(tau(2, 0, 1.5, 1.2, DEFAULT_RHO)).toBe(1);
    expect(tau(0, 2, 1.5, 1.2, DEFAULT_RHO)).toBe(1);
    expect(tau(3, 3, 1.5, 1.2, DEFAULT_RHO)).toBe(1);
    expect(tau(5, 1, 1.5, 1.2, DEFAULT_RHO)).toBe(1);
  });

  it("matches the Dixon-Coles formula on the 4 special cells", () => {
    const lambda = 1.6;
    const mu = 1.1;
    const rho = -0.13;
    expect(tau(0, 0, lambda, mu, rho)).toBeCloseTo(1 - lambda * mu * rho, 10);
    expect(tau(0, 1, lambda, mu, rho)).toBeCloseTo(1 + lambda * rho, 10);
    expect(tau(1, 0, lambda, mu, rho)).toBeCloseTo(1 + mu * rho, 10);
    expect(tau(1, 1, lambda, mu, rho)).toBeCloseTo(1 - rho, 10);
  });
});

describe("applyDixonColesAdjustment", () => {
  const lambdaHome = 1.63;
  const lambdaAway = 1.1;
  const matrix = buildProbabilityMatrix(lambdaHome, lambdaAway);

  it("never emits a negative probability, even for an absurd rho", () => {
    for (const [lh, la] of [
      [1.6, 1.1],
      [3.2, 2.7],
      [0.5, 0.4],
    ]) {
      for (const rho of [-5, -0.9, 0.9, 5]) {
        const adjusted = applyDixonColesAdjustment(buildProbabilityMatrix(lh, la), lh, la, rho);
        for (const row of adjusted) {
          for (const cell of row) expect(cell).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("still sums to 1 after the correction", () => {
    for (const rho of [-0.2, 0, 0.15]) {
      const adjusted = applyDixonColesAdjustment(matrix, lambdaHome, lambdaAway, rho);
      const total = adjusted.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  /**
   * The property that makes this the *correct* Dixon-Coles correction rather than an
   * arbitrary tweak: the four adjusted cells hold the same combined mass they had
   * before, so rho redistributes probability among low scorelines without inventing
   * or destroying any. The rho terms cancel algebraically; this pins that down.
   */
  it("redistributes mass among the four cells without changing their total", () => {
    const cells: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    const before = cells.reduce((s, [x, y]) => s + matrix[x][y], 0);
    for (const rho of [-0.25, -0.1, 0.1]) {
      const raw = matrix.map((row) => [...row]);
      for (const [x, y] of cells) raw[x][y] = matrix[x][y] * tau(x, y, lambdaHome, lambdaAway, rho);
      const after = cells.reduce((s, [x, y]) => s + raw[x][y], 0);
      expect(after).toBeCloseTo(before, 12);
    }
  });

  it("is a no-op (within float tolerance) when rho=0", () => {
    const adjusted = applyDixonColesAdjustment(matrix, lambdaHome, lambdaAway, 0);
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        expect(adjusted[i][j]).toBeCloseTo(matrix[i][j], 6);
      }
    }
  });

  it("shifts exactly the 4 special cells relative to their tau, pre-renormalization", () => {
    const rho = DEFAULT_RHO;
    const adjusted = applyDixonColesAdjustment(matrix, lambdaHome, lambdaAway, rho);
    const total = adjusted.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0);

    // Un-normalize to recover the pre-renormalization values and compare to tau directly.
    for (const [x, y] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const) {
      const preNormalized = adjusted[x][y] * total;
      expect(preNormalized).toBeCloseTo(matrix[x][y] * tau(x, y, lambdaHome, lambdaAway, rho), 6);
    }
  });

  it("keeps a uniform scale factor on every untouched cell (mass isn't redistributed outside the 4 cells)", () => {
    const rho = DEFAULT_RHO;
    const adjusted = applyDixonColesAdjustment(matrix, lambdaHome, lambdaAway, rho);
    const specialCells = new Set(["0-0", "0-1", "1-0", "1-1"]);

    let scaleFactor: number | null = null;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        if (specialCells.has(`${i}-${j}`)) continue;
        if (matrix[i][j] === 0) continue;
        const ratio = adjusted[i][j] / matrix[i][j];
        if (scaleFactor === null) {
          scaleFactor = ratio;
        } else {
          expect(ratio).toBeCloseTo(scaleFactor, 8);
        }
      }
    }
  });

  it("still sums to ~1 after renormalization", () => {
    const adjusted = applyDixonColesAdjustment(matrix, lambdaHome, lambdaAway, DEFAULT_RHO);
    const total = adjusted.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0);
    expect(total).toBeCloseTo(1, 6);
  });
});
