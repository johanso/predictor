import type { ConfidenceLevel } from "@/types/domain";

/**
 * Tracking is gated on DATA QUALITY only — never on how confident the model is.
 *
 * A probability floor used to sit here (58%), and it was self-defeating: measured
 * over three Brasileirão seasons, only 16% of fixtures cleared it — about 1.6 per
 * matchday — and all of them came from the same narrow slice of the model's output
 * range (which tops out at 81% and has a median of 46%). Calibration can only be
 * measured across the full range, so filtering by confidence *before* recording
 * guaranteed the calibration chart would never learn anything about the other 84%
 * of predictions, including the ones where the model is most likely to be wrong.
 *
 * The user pressing "Enviar a autoevaluación" is the filter. All this rejects is a
 * prediction built on too little data to be worth scoring at all.
 */
export function qualifiesForTracking(confidenceLevel: ConfidenceLevel): boolean {
  return confidenceLevel !== "baja";
}
