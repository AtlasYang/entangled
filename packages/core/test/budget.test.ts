import { describe, expect, it } from "vitest";
import { allocateBudget, budgetIntensity, selectTop } from "../src/index.js";

const cands = (n: number, priorities: Record<number, number> = {}) =>
  Array.from({ length: n }, (_, i) => ({ target: `t${i}`, priority: priorities[i] }));

describe("budgetIntensity", () => {
  it("is full for small selections and decays with more", () => {
    expect(budgetIntensity(0)).toBe(0);
    expect(budgetIntensity(1)).toBe(1);
    expect(budgetIntensity(3)).toBe(1);
    expect(budgetIntensity(4)).toBeCloseTo(Math.sqrt(3 / 4), 3);
    expect(budgetIntensity(12)).toBe(0.5);
  });

  it("is monotonically non-increasing and floored", () => {
    let prev = 1;
    for (let n = 1; n <= 200; n++) {
      const v = budgetIntensity(n);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0.35);
      prev = v;
    }
  });

  it("scales the requested intensity and clamps options", () => {
    expect(budgetIntensity(1, { intensity: 0.5 })).toBe(0.5);
    expect(budgetIntensity(1, { intensity: 7 })).toBe(1);
    expect(budgetIntensity(100, { minIntensity: 0.6 })).toBe(0.6);
  });
});

describe("allocateBudget", () => {
  it("caps the number of targets and keeps document order", () => {
    const r = allocateBudget(cands(10), { maxTargets: 4 });
    expect(r.active.map((a) => a.target)).toEqual(["t0", "t1", "t2", "t3"]);
    expect(r.overflow).toEqual(["t4", "t5", "t6", "t7", "t8", "t9"]);
    expect(new Set(r.active.map((a) => a.intensity))).toEqual(new Set([budgetIntensity(4)]));
  });

  it("prefers higher priority, then reports in document order", () => {
    const r = allocateBudget(cands(6, { 5: 10, 2: 5 }), { maxTargets: 3 });
    expect(r.active.map((a) => a.target)).toEqual(["t0", "t2", "t5"]);
    expect(r.overflow).toEqual(["t1", "t3", "t4"]);
  });

  it("handles empty input and zero budget", () => {
    expect(allocateBudget([], { maxTargets: 8 })).toEqual({ active: [], overflow: [] });
    const r = allocateBudget(cands(2), { maxTargets: 0 });
    expect(r.active).toEqual([]);
    expect(r.overflow).toEqual(["t0", "t1"]);
  });

  it("total visual weight grows sublinearly with the selection", () => {
    const weight = (n: number) => n * budgetIntensity(n);
    expect(weight(8)).toBeLessThan(8 * 0.7);
    expect(weight(8)).toBeGreaterThan(weight(3));
  });
});

describe("selectTop", () => {
  it("equals sort().slice(0, k) for random input", () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 50);
    for (let round = 0; round < 50; round++) {
      const items = Array.from({ length: 1 + rand() * 4 }, (_, i) => ({ v: rand(), i }));
      const k = rand() % 12;
      const cmp = (a: { v: number }, b: { v: number }) => a.v - b.v;
      // Stable, like sort.
      expect(selectTop(items, k, cmp)).toEqual([...items].sort(cmp).slice(0, k));
    }
  });

  it("makes O(n log k) comparisons", () => {
    let calls = 0;
    const items = Array.from({ length: 5000 }, (_, i) => 5000 - i); // worst case: descending
    selectTop(items, 8, (a, b) => (calls++, a - b));
    expect(calls).toBeLessThan(5000 * 5);
  });
});
