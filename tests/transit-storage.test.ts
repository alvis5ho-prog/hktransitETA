import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
  },
}));

import { loadTransitSettings, saveTransitSettings } from "../lib/transit-storage";

describe("transit settings storage", () => {
  beforeEach(() => store.clear());

  it("returns safe defaults when no settings have been saved", async () => {
    await expect(loadTransitSettings()).resolves.toEqual({ query: "91", routes: [] });
  });

  it("persists the query, routes, direction, and selected stop", async () => {
    await saveTransitSettings({
      query: "103M",
      routes: [{ operator: "GMB", route: "103M", directionKey: "outbound", stopId: "123" }],
    });
    await expect(loadTransitSettings()).resolves.toEqual({
      query: "103M",
      routes: [{ operator: "GMB", route: "103M", directionKey: "outbound", stopId: "123" }],
    });
  });

  it("ignores malformed route entries", async () => {
    store.set("hk-transit-eta:settings:v1", JSON.stringify({ query: "98D", routes: [{ route: 98 }, null, { operator: "KMB", route: "98D" }] }));
    await expect(loadTransitSettings()).resolves.toEqual({ query: "98D", routes: [{ operator: "KMB", route: "98D" }] });
  });
});
