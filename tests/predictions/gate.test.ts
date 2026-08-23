import { describe, it, expect } from "vitest";
import { qualifiesForTracking } from "@/lib/predictions/gate";

describe("qualifiesForTracking", () => {
  it("accepts alta confidence", () => {
    expect(qualifiesForTracking("alta")).toBe(true);
  });

  it("accepts media confidence", () => {
    expect(qualifiesForTracking("media")).toBe(true);
  });

  it("rejects baja confidence — too little data for the evaluation to mean anything", () => {
    expect(qualifiesForTracking("baja")).toBe(false);
  });

  // Guards the point of the redesign: a low-probability prediction is exactly the
  // kind the calibration chart needs, so confidence in the favourite must not gate it.
  it("does not gate on how confident the model is in the favourite", () => {
    expect(qualifiesForTracking("alta")).toBe(true);
    expect(qualifiesForTracking("media")).toBe(true);
  });
});
