import { describe, it, expect } from "vitest";
import {
  calculateMedian,
  calculateIQR,
  evaluateEvidenceStrength,
  classifyQuadrant,
} from "./publishing-intelligence.calculator";

describe("Phase 3.4G: Publishing Intelligence Calculation & Evidence Logic", () => {
  describe("calculateMedian", () => {
    it("returns 0 for empty arrays", () => {
      expect(calculateMedian([])).toBe(0);
    });

    it("returns single value for array of length 1", () => {
      expect(calculateMedian([42])).toBe(42);
    });

    it("returns middle element for odd-length array", () => {
      expect(calculateMedian([10, 50, 20])).toBe(20);
      expect(calculateMedian([100, 200, 300, 400, 500])).toBe(300);
    });

    it("returns average of middle two elements for even-length array", () => {
      expect(calculateMedian([10, 20, 30, 40])).toBe(25);
      expect(calculateMedian([100, 200])).toBe(150);
    });
  });

  describe("calculateIQR", () => {
    it("returns zero metrics for empty array", () => {
      const res = calculateIQR([]);
      expect(res.median).toBe(0);
      expect(res.iqr).toBe(0);
    });

    it("calculates Q1, median, Q3 and IQR correctly", () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80];
      const res = calculateIQR(values);
      expect(res.median).toBe(45);
      expect(res.q1).toBe(25);
      expect(res.q3).toBe(65);
      expect(res.iqr).toBe(40);
    });
  });

  describe("evaluateEvidenceStrength", () => {
    it("returns INSUFFICIENT when sample size is below minimum window threshold (N < 3)", () => {
      const res0 = evaluateEvidenceStrength(0, 90, []);
      expect(res0.strength).toBe("INSUFFICIENT");
      expect(res0.reason).toContain("Insufficient sample size");

      const res1 = evaluateEvidenceStrength(1, 90, [1000]);
      expect(res1.strength).toBe("INSUFFICIENT");

      const res2 = evaluateEvidenceStrength(2, 90, [1000, 1200]);
      expect(res2.strength).toBe("INSUFFICIENT");
    });

    it("returns LOW for preliminary sample sizes (3 <= N < 5)", () => {
      const res = evaluateEvidenceStrength(3, 90, [1000, 1100, 1200]);
      expect(res.strength).toBe("LOW");
      expect(res.reason).toContain("Preliminary sample size");
    });

    it("returns MODERATE for sample sizes between 5 and 14", () => {
      const values = [10, 11, 12, 13, 14, 15, 16, 17];
      const res = evaluateEvidenceStrength(8, 60, values);
      expect(res.strength).toBe("MODERATE");
      expect(res.reason).toContain("Meaningful historical sample size");
    });

    it("returns HIGH for large sample sizes (N >= 15) with low dispersion (IQR ratio <= 0.8)", () => {
      // 15 values clustered tightly around 1000
      const values = Array(15).fill(1000).map((v, i) => v + (i * 10));
      const res = evaluateEvidenceStrength(15, 90, values);
      expect(res.strength).toBe("HIGH");
      expect(res.reason).toContain("Substantial historical sample size");
    });

    it("downgrades to MODERATE when N >= 15 has high dispersion (IQR ratio > 0.8)", () => {
      // 15 values with extreme spread
      const values = [10, 20, 30, 40, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
      const res = evaluateEvidenceStrength(15, 90, values);
      expect(res.strength).toBe("MODERATE");
      expect(res.reason).toContain("moderate performance variance");
    });
  });

  describe("classifyQuadrant", () => {
    it("returns UNCLASSIFIED when sample size is below minimum threshold (< 3)", () => {
      const res = classifyQuadrant("ABOVE_AVERAGE", 50.0, 2);
      expect(res.quadrant).toBe("UNCLASSIFIED");
      expect(res.performanceLevel).toBe("INSUFFICIENT_DATA");
    });

    it("returns UNCLASSIFIED when deltaPercent is null", () => {
      const res = classifyQuadrant("ABOVE_AVERAGE", null, 10);
      expect(res.quadrant).toBe("UNCLASSIFIED");
    });

    it("classifies Q1: Higher Consumption / Higher Early Velocity", () => {
      const res = classifyQuadrant("ABOVE_AVERAGE", 15.5, 10);
      expect(res.quadrant).toBe("Q1_HIGH_CONSUMPTION_HIGH_VELOCITY");
      expect(res.label).toContain("Relatively higher consumption / relatively higher early performance");
      expect(res.performanceLevel).toBe("ABOVE_BASELINE");
    });

    it("classifies Q2: Higher Consumption / Lower Early Velocity", () => {
      const res = classifyQuadrant("ABOVE_AVERAGE", -12.0, 10);
      expect(res.quadrant).toBe("Q2_HIGH_CONSUMPTION_LOW_VELOCITY");
      expect(res.label).toContain("Relatively higher consumption / relatively lower early performance");
      expect(res.performanceLevel).toBe("BELOW_BASELINE");
    });

    it("classifies Q3: Lower Consumption / Higher Early Velocity", () => {
      const res = classifyQuadrant("BELOW_AVERAGE", 25.0, 10);
      expect(res.quadrant).toBe("Q3_LOW_CONSUMPTION_HIGH_VELOCITY");
      expect(res.label).toContain("Relatively lower consumption / relatively higher early performance");
      expect(res.performanceLevel).toBe("ABOVE_BASELINE");
    });

    it("classifies Q4: Lower Consumption / Lower Early Velocity", () => {
      const res = classifyQuadrant("BELOW_AVERAGE", -20.0, 10);
      expect(res.quadrant).toBe("Q4_LOW_CONSUMPTION_LOW_VELOCITY");
      expect(res.label).toContain("Relatively lower consumption / relatively lower early performance");
      expect(res.performanceLevel).toBe("BELOW_BASELINE");
    });

    it("classifies UNCLASSIFIED when velocity is within baseline range (-5% to +5%)", () => {
      const res = classifyQuadrant("ABOVE_AVERAGE", 2.5, 10);
      expect(res.quadrant).toBe("UNCLASSIFIED");
      expect(res.performanceLevel).toBe("BASELINE");
    });
  });
});
