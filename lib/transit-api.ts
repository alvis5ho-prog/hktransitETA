export type TransitOperator = "KMB" | "CTB" | "GMB";

export type DirectionKey = "inbound" | "outbound";

export type RouteDirection = {
  key: DirectionKey;
  bound: "I" | "O";
  origin: string;
  destination: string;
  serviceType?: string;
  gmbRouteSeq?: number;
};

export type TransitRoute = {
  operator: TransitOperator;
  route: string;
  directions: RouteDirection[];
  gmbRouteId?: number;
  gmbRegion?: "HKI" | "KLN" | "NT";
};

export type TransitStop = {
  stop: string;
  seq: number;
  nameTc: string;
  nameEn: string;
};

export type TransitEta = {
  etaSeq: number;
  eta: string | null;
  minutes: number | null;
  destinationTc: string;
  destinationEn: string;
  remarkTc: string;
};

type ApiEnvelope<T> = { data?: T; message?: string };

type KmbRouteRow = { route: string; bound: "I" | "O"; service_type: string; orig_tc?: string; dest_tc?: string; orig_en?: string; dest_en?: string };
type KmbRouteStopRow = { route: string; bound: "I" | "O"; service_type: string; seq: number; stop: string };
type KmbStop = { stop: string; name_tc?: string; name_en?: string };
type KmbEtaRow = { dir?: "I" | "O"; eta_seq?: number; eta?: string | null; dest_tc?: string; dest_en?: string; rmk_tc?: string };
type CityRoute = { co?: "CTB"; route?: string; orig_tc?: string; dest_tc?: string; orig_en?: string; dest_en?: string };
type CityRouteStopRow = { route: string; dir: "I" | "O"; seq: number; stop: string };
type CityStop = { stop: string; name_tc?: string; name_en?: string };
type CityEtaRow = { dir?: "I" | "O"; eta_seq?: number; eta?: string | null; dest_tc?: string; dest_en?: string; rmk_tc?: string };
type GmbRouteDirection = { route_seq: number; orig_tc?: string; dest_tc?: string; orig_en?: string; dest_en?: string };
type GmbRouteVariation = { region: "HKI" | "KLN" | "NT"; route_code: string; route_id: number; directions?: GmbRouteDirection[] };
type GmbRouteStop = { stop_seq: number; stop_id: number; name_tc?: string; name_en?: string };
type GmbEtaRow = { eta_seq?: number; timestamp?: string | null; diff?: number | null; remarks_tc?: string | null; remarks_en?: string | null };

type GmbRoutesPayload = { routes?: Partial<Record<"HKI" | "KLN" | "NT", string[]>> };
type GmbRouteStopPayload = { route_stops?: GmbRouteStop[] };
type GmbEtaPayload = { stop_id?: number; enabled?: boolean; eta?: GmbEtaRow[] };

const KMB_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const CITYBUS_BASE = "https://rt.data.gov.hk/v1/transport/citybus-nwfb";
const GMB_BASE = "https://data.etagmb.gov.hk";

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeRouteCode(value: string) {
  return value.toUpperCase().replace(/九巴|城巴|綠色小巴|專線小巴|小巴|KMB|CTB|GMB/g, "").replace(/\s+/g, "").trim();
}

export function requestedOperator(value: string): TransitOperator | null {
  const input = value.toUpperCase();
  if (input.includes("綠色小巴") || input.includes("專線小巴") || input.includes("小巴") || input.includes("GMB")) return "GMB";
  if (input.includes("九巴") || input.includes("KMB")) return "KMB";
  if (input.includes("城巴") || input.includes("CTB")) return "CTB";
  return null;
}

function directionFromBound(bound: "I" | "O"): DirectionKey { return bound === "I" ? "inbound" : "outbound"; }
function minutesUntil(eta: string | null | undefined) {
  if (!eta) return null;
  const timestamp = Date.parse(eta);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.round((timestamp - Date.now()) / 60000));
}

/** Hide an arrival that has already passed, or an uncheckable stale remark. */
export function shouldDisplayEta(eta: string | null | undefined, remark = "", now = Date.now()) {
  if (eta) {
    const timestamp = Date.parse(eta);
    return Number.isNaN(timestamp) || timestamp >= now - 30_000;
  }
  return Boolean(remark.trim()) && !/即將到達|即將抵達/.test(remark);
}

async function lookupGmbRoute(route: string): Promise<TransitRoute | null> {
  const regions: Array<"HKI" | "KLN" | "NT"> = ["HKI", "KLN", "NT"];
  const regionalResults = await Promise.allSettled(
    regions.map(async (region) => ({
      region,
      payload: await fetchJson<ApiEnvelope<GmbRouteVariation[]>>(`${GMB_BASE}/route/${region}/${encodeURIComponent(route)}`),
    })),
  );
  const match = regionalResults.find((result) => result.status === "fulfilled" && result.value.payload.data?.length);
  if (!match || match.status !== "fulfilled") return null;
  const region = match.value.region;
  const variations = match.value.payload.data || [];
  const variation = variations[0];
  if (!variation) return null;
  const directions = (variation.directions || []).map((item, index) => ({
    key: index === 0 ? "outbound" as const : "inbound" as const,
    bound: index === 0 ? "O" as const : "I" as const,
    origin: item.orig_tc || item.orig_en || "起點資料暫不可用",
    destination: item.dest_tc || item.dest_en || "終點資料暫不可用",
    gmbRouteSeq: item.route_seq,
  }));
  return { operator: "GMB", route: variation.route_code, directions, gmbRouteId: variation.route_id, gmbRegion: region };
}

export async function lookupRoutes(input: string): Promise<TransitRoute[]> {
  const route = normalizeRouteCode(input);
  if (!route) return [];
  const [kmbResult, cityResult, gmbResult] = await Promise.allSettled([
    fetchJson<ApiEnvelope<KmbRouteRow[]>>(`${KMB_BASE}/route/`),
    fetchJson<ApiEnvelope<CityRoute>>(`${CITYBUS_BASE}/route/CTB/${encodeURIComponent(route)}`),
    lookupGmbRoute(route),
  ]);
  const results: TransitRoute[] = [];
  if (kmbResult.status === "fulfilled") {
    const matchingRows = (kmbResult.value.data || []).filter((item) => normalizeRouteCode(item.route) === route);
    if (matchingRows.length > 0) {
      const directions = matchingRows.map((item) => ({ key: directionFromBound(item.bound), bound: item.bound, origin: item.orig_tc || item.orig_en || "起點資料暫不可用", destination: item.dest_tc || item.dest_en || "終點資料暫不可用", serviceType: item.service_type }));
      results.push({ operator: "KMB", route, directions: directions.filter((direction, index, all) => all.findIndex((item) => item.key === direction.key) === index) });
    }
  }
  if (cityResult.status === "fulfilled") {
    const raw = cityResult.value.data;
    const cityRoute = Array.isArray(raw) ? raw[0] : raw;
    if (cityRoute?.route) results.push({ operator: "CTB", route: cityRoute.route, directions: ["inbound", "outbound"].map((key) => ({ key: key as DirectionKey, bound: key === "inbound" ? "I" : "O", origin: key === "inbound" ? cityRoute.dest_tc || cityRoute.dest_en || "起點資料暫不可用" : cityRoute.orig_tc || cityRoute.orig_en || "起點資料暫不可用", destination: key === "inbound" ? cityRoute.orig_tc || cityRoute.orig_en || "終點資料暫不可用" : cityRoute.dest_tc || cityRoute.dest_en || "終點資料暫不可用" })) });
  }
  if (gmbResult.status === "fulfilled" && gmbResult.value) results.push(gmbResult.value);
  return results;
}

export async function getRouteStops(route: TransitRoute, direction: RouteDirection): Promise<TransitStop[]> {
  if (route.operator === "GMB") {
    const payload = await fetchJson<ApiEnvelope<GmbRouteStopPayload>>(`${GMB_BASE}/route-stop/${route.gmbRouteId}/${direction.gmbRouteSeq || 1}`);
    return (payload.data?.route_stops || []).sort((a, b) => a.stop_seq - b.stop_seq).map((stop) => ({ stop: String(stop.stop_id), seq: stop.stop_seq, nameTc: stop.name_tc || "站點資料暫不可用", nameEn: stop.name_en || "Stop data unavailable" }));
  }
  if (route.operator === "KMB") {
    const serviceType = direction.serviceType || "1";
    const payload = await fetchJson<ApiEnvelope<KmbRouteStopRow[]>>(`${KMB_BASE}/route-stop/${encodeURIComponent(route.route)}/${direction.key}/${serviceType}`);
    return Promise.all((payload.data || []).sort((a, b) => a.seq - b.seq).map(async (row) => { try { const stop = (await fetchJson<ApiEnvelope<KmbStop>>(`${KMB_BASE}/stop/${row.stop}`)).data; return { stop: row.stop, seq: row.seq, nameTc: stop?.name_tc || "站點資料暫不可用", nameEn: stop?.name_en || "Stop data unavailable" }; } catch { return { stop: row.stop, seq: row.seq, nameTc: "站點資料暫不可用", nameEn: "Stop data unavailable" }; } }));
  }
  const payload = await fetchJson<ApiEnvelope<CityRouteStopRow[]>>(`${CITYBUS_BASE}/route-stop/CTB/${encodeURIComponent(route.route)}/${direction.key}`);
  return Promise.all((payload.data || []).sort((a, b) => a.seq - b.seq).map(async (row) => { try { const stop = (await fetchJson<ApiEnvelope<CityStop>>(`${CITYBUS_BASE}/stop/${row.stop}`)).data; return { stop: row.stop, seq: row.seq, nameTc: stop?.name_tc || "站點資料暫不可用", nameEn: stop?.name_en || "Stop data unavailable" }; } catch { return { stop: row.stop, seq: row.seq, nameTc: "站點資料暫不可用", nameEn: "Stop data unavailable" }; } }));
}

export async function getStopEtas(route: TransitRoute, direction: RouteDirection, stop: TransitStop): Promise<TransitEta[]> {
  if (route.operator === "GMB") {
    const payload = await fetchJson<ApiEnvelope<GmbEtaPayload>>(`${GMB_BASE}/eta/route-stop/${route.gmbRouteId}/${direction.gmbRouteSeq || 1}/${stop.seq}`);
    return (payload.data?.eta || []).filter((row) => shouldDisplayEta(row.timestamp, row.remarks_tc || "")).slice(0, 3).map((row) => ({ etaSeq: row.eta_seq || 0, eta: row.timestamp || null, minutes: row.diff ?? minutesUntil(row.timestamp), destinationTc: direction.destination, destinationEn: direction.destination, remarkTc: row.remarks_tc || "" }));
  }
  let rows: KmbEtaRow[] | CityEtaRow[] = [];
  if (route.operator === "KMB") {
    const payload = await fetchJson<ApiEnvelope<KmbEtaRow[]>>(`${KMB_BASE}/eta/${stop.stop}/${encodeURIComponent(route.route)}/${direction.serviceType || "1"}`);
    rows = payload.data || [];
  } else {
    const payload = await fetchJson<ApiEnvelope<CityEtaRow[]>>(`${CITYBUS_BASE}/eta/CTB/${stop.stop}/${encodeURIComponent(route.route)}`);
    rows = payload.data || [];
  }
  return rows.filter((row) => !row.dir || row.dir === direction.bound).filter((row) => shouldDisplayEta(row.eta, row.rmk_tc || "")).sort((a, b) => (a.eta_seq || 0) - (b.eta_seq || 0)).slice(0, 3).map((row) => ({ etaSeq: row.eta_seq || 0, eta: row.eta || null, minutes: minutesUntil(row.eta), destinationTc: row.dest_tc || "目的地資料暫不可用", destinationEn: row.dest_en || "Destination unavailable", remarkTc: row.rmk_tc || "" }));
}

export function formatUpdatedAt(value: Date | null) {
  if (!value) return "尚未更新";
  return value.toLocaleTimeString("zh-HK", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
