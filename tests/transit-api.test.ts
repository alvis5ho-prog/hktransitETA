import { describe, expect, it } from "vitest";

import { formatUpdatedAt, normalizeRouteCode, requestedOperator } from "../lib/transit-api";

describe("transit api helpers", () => {
  it("normalizes common Hong Kong route input", () => {
    expect(normalizeRouteCode(" 九巴 98d ")).toBe("98D");
    expect(normalizeRouteCode("KMB 91")).toBe("91");
    expect(normalizeRouteCode("CTB 5B")).toBe("5B");
    expect(normalizeRouteCode("綠色小巴 103M")).toBe("103M");
  });

  it("keeps empty input empty", () => {
    expect(normalizeRouteCode("   ")).toBe("");
  });

  it("recognizes an explicit green minibus request", () => {
    expect(requestedOperator("小巴 103")).toBe("GMB");
    expect(requestedOperator("綠色小巴 103M")).toBe("GMB");
    expect(requestedOperator("九巴 103")).toBe("KMB");
    expect(requestedOperator("103")).toBeNull();
  });

  it("formats the latest update time in Hong Kong 24-hour format", () => {
    const formatted = formatUpdatedAt(new Date("2026-09-23T10:05:07+08:00"));
    expect(formatted).toMatch(/10:05:07/);
    expect(formatUpdatedAt(null)).toBe("尚未更新");
  });
});
