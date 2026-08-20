import { describe, it, expect } from "vitest";
import { tau, applyDixonColesAdjustment, DEFAULT_RHO } from "@/lib/poisson/dixonColes";
import { buildProbabilityMatrix } from "@/lib/poisson/markets";

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
