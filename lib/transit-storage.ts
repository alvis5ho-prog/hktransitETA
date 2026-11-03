import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "hk-transit-eta:settings:v1";

export type SavedRouteSetting = {
  operator: string;
  route: string;
  directionKey?: string;
  stopId?: string;
};

export type TransitSettings = {
  query: string;
  routes: SavedRouteSetting[];
};

const DEFAULT_SETTINGS: TransitSettings = {
  query: "91",
  routes: [],
};

export async function loadTransitSettings(): Promise<TransitSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TransitSettings>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : DEFAULT_SETTINGS.query,
      routes: Array.isArray(parsed.routes)
        ? parsed.routes.filter(
            (item): item is SavedRouteSetting =>
              Boolean(item && typeof item.operator === "string" && typeof item.route === "string"),
          )
        : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveTransitSettings(settings: TransitSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage is optional; the app remains usable if the browser blocks it.
  }
}
