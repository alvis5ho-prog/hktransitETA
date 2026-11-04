import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import {
  formatUpdatedAt,
  getRouteStops,
  getStopEtas,
  lookupRoutes,
  type RouteDirection,
  type TransitEta,
  type TransitRoute,
  type TransitStop,
} from "@/lib/transit-api";
import {
  loadTransitSettings,
  saveTransitSettings,
  type SavedRouteSetting,
} from "@/lib/transit-storage";

const COLORS = {
  background: "#10191C",
  panel: "#172326",
  panelRaised: "#1D2C2F",
  panelSoft: "#142023",
  border: "#294346",
  text: "#F3F8F7",
  muted: "#94AAA9",
  accent: "#48BDB1",
  accentDark: "#1F8F87",
  accentSoft: "#183D3D",
  white: "#FFFFFF",
  warning: "#F4D681",
};

type RouteCardState = {
  route: TransitRoute;
  direction: RouteDirection;
  stops: TransitStop[];
  selectedStop: TransitStop | null;
  etas: TransitEta[];
  isRefreshing: boolean;
  updatedAt: Date | null;
};

function haptic() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function etaLabel(eta: TransitEta) {
  if (eta.minutes === null) return "暫無時間";
  if (eta.minutes <= 0) return "即將到達";
  return `${eta.minutes} 分鐘`;
}

function directionLabel(direction: RouteDirection) {
  return direction.key === "inbound" ? "往起點" : "往終點";
}

function cardKey(route: TransitRoute) {
  return `${route.operator}-${route.route}`;
}

function operatorLabel(operator: TransitRoute["operator"]) {
  if (operator === "GMB") return "綠色小巴";
  if (operator === "KMB") return "九巴";
  return "城巴";
}

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [query, setQuery] = useState("91");
  const [cards, setCards] = useState<RouteCardState[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [hasRestoredSettings, setHasRestoredSettings] = useState(false);
  const [routeChoices, setRouteChoices] = useState<TransitRoute[]>([]);

  const hydrateRoute = useCallback(async (route: TransitRoute, setting?: SavedRouteSetting): Promise<RouteCardState | null> => {
    const direction = route.directions.find((item) => item.key === setting?.directionKey) || route.directions[0];
    if (!direction) return null;
    try {
      const stops = await getRouteStops(route, direction);
      const selectedStop = stops.find((item) => item.stop === setting?.stopId) || stops[0] || null;
      const etas = selectedStop ? await getStopEtas(route, direction, selectedStop) : [];
      return { route, direction, stops, selectedStop, etas, isRefreshing: false, updatedAt: new Date() };
    } catch {
      return { route, direction, stops: [], selectedStop: null, etas: [], isRefreshing: false, updatedAt: null };
    }
  }, []);

  const loadDefaultRoutes = useCallback(async (savedRoutes?: SavedRouteSetting[]) => {
    setIsSearching(true);
    setError("");
    try {
      const settings = savedRoutes?.length ? savedRoutes : [{ operator: "KMB", route: "91" }, { operator: "KMB", route: "98D" }];
      const results = await Promise.all(settings.map(async (setting) => {
        const found = await lookupRoutes(setting.route);
        return found.find((item) => item.operator === setting.operator) || found[0];
      }));
      const hydrated = await Promise.all(results.map((route, index) => route ? hydrateRoute(route, settings[index]) : null));
      setCards(hydrated.filter((item): item is RouteCardState => Boolean(item)));
    } catch {
      setError("資料服務暫時未能連線，請稍後再試");
    } finally {
      setIsSearching(false);
    }
  }, [hydrateRoute]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settings = await loadTransitSettings();
      if (cancelled) return;
      setQuery(settings.query);
      await loadDefaultRoutes(settings.routes);
      if (!cancelled) setHasRestoredSettings(true);
    })();
    return () => { cancelled = true; };
  }, [loadDefaultRoutes]);

  useEffect(() => {
    if (!hasRestoredSettings) return;
    void saveTransitSettings({
      query,
      routes: cards.map((card) => ({
        operator: card.route.operator,
        route: card.route.route,
        directionKey: card.direction.key,
        stopId: card.selectedStop?.stop,
      })),
    });
  }, [cards, hasRestoredSettings, query]);

  const refreshCard = useCallback(async (card: RouteCardState) => {
    if (!card.selectedStop) return;
    setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, isRefreshing: true } : item));
    try {
      const etas = await getStopEtas(card.route, card.direction, card.selectedStop);
      setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, etas, isRefreshing: false, updatedAt: new Date() } : item));
    } catch {
      setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, isRefreshing: false } : item));
    }
  }, []);

  useEffect(() => {
    if (cards.length === 0) return;
    const timer = setInterval(() => {
      cards.forEach((card) => void refreshCard(card));
    }, 30000);
    return () => clearInterval(timer);
  }, [cards, refreshCard]);

  const updateCardDirection = useCallback(async (card: RouteCardState, direction: RouteDirection) => {
    haptic();
    setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, direction, stops: [], selectedStop: null, etas: [], updatedAt: null, isRefreshing: true } : item));
    try {
      const stops = await getRouteStops(card.route, direction);
      const selectedStop = stops[0] || null;
      const etas = selectedStop ? await getStopEtas(card.route, direction, selectedStop) : [];
      setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, direction, stops, selectedStop, etas, updatedAt: new Date(), isRefreshing: false } : item));
    } catch {
      setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, isRefreshing: false } : item));
    }
  }, []);

  const updateCardStop = useCallback(async (card: RouteCardState, stop: TransitStop) => {
    haptic();
    setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, selectedStop: stop, isRefreshing: true } : item));
    try {
      const etas = await getStopEtas(card.route, card.direction, stop);
      setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, selectedStop: stop, etas, updatedAt: new Date(), isRefreshing: false } : item));
    } catch {
      setCards((current) => current.map((item) => cardKey(item.route) === cardKey(card.route) ? { ...item, isRefreshing: false } : item));
    }
  }, []);

  const searchRoute = useCallback(async (value: string) => {
    const input = value.trim();
    if (!input) return;
    Keyboard.dismiss();
    setIsSearching(true);
    setError("");
    try {
      const found = await lookupRoutes(input);
      setRouteChoices(found);
      if (found.length > 1) return;
      const route = found[0];
      if (!route) {
        setError("找不到此路線，請嘗試其他號碼");
        return;
      }
      const nextCard = await hydrateRoute(route);
      if (nextCard) setCards((current) => [nextCard, ...current.filter((item) => cardKey(item.route) !== cardKey(route))].slice(0, 2));
    } catch {
      setError("資料服務暫時未能連線，請稍後再試");
    } finally {
      setIsSearching(false);
    }
  }, [hydrateRoute]);

  const chooseRoute = useCallback(async (route: TransitRoute) => {
    haptic();
    setRouteChoices([]);
    setIsSearching(true);
    setError("");
    try {
      const nextCard = await hydrateRoute(route);
      if (nextCard) setCards((current) => [nextCard, ...current.filter((item) => cardKey(item.route) !== cardKey(route))].slice(0, 2));
    } catch {
      setError("資料服務暫時未能連線，請稍後再試");
    } finally {
      setIsSearching(false);
    }
  }, [hydrateRoute]);

  const renderCard = useCallback(({ item }: { item: RouteCardState }) => {
    const firstEarlyEta = item.etas.find((eta) => eta.minutes !== null && eta.minutes <= 9);
    return (
      <View style={[styles.routeCard, isLandscape && styles.routeCardLandscape]}>
        <View style={styles.routeCardTop}>
          <View style={styles.routeHeading}>
            <Text style={styles.routeCaption}>路線號碼: {item.route.route}</Text>
            <Text style={styles.stopTitle} numberOfLines={1}>{item.selectedStop?.nameTc || "載入站點中…"} <Text style={styles.stopCode}>{item.selectedStop ? `(${item.selectedStop.stop})` : ""}</Text></Text>
          </View>
          <View style={styles.routeBadge}><Text style={styles.routeBadgeText}>{item.route.operator}</Text></View>
        </View>
        <View style={styles.routeIdentityRow}><Text style={styles.routeNumber}>{item.route.route}</Text><Text style={styles.operatorName}>{item.route.operator}</Text></View>
        <Text style={styles.sectionLabel}>選擇上車方向</Text>
        <View style={styles.directionRow}>
          {item.route.directions.map((direction) => {
            const active = item.direction.key === direction.key;
            return <Pressable key={direction.key} onPress={() => void updateCardDirection(item, direction)} style={({ pressed }) => [styles.directionCard, active && styles.directionCardActive, pressed && styles.pressed]}><Text style={[styles.directionSmall, active && styles.directionSmallActive]}>{directionLabel(direction)}</Text><View style={styles.directionValueRow}><Text style={[styles.directionValue, active && styles.directionValueActive]} numberOfLines={1}>{direction.destination}</Text>{active ? <Text style={styles.arrow}>→</Text> : null}</View></Pressable>;
          })}
        </View>
        <Text style={styles.selectedLabel}>選定站點: <Text style={styles.selectedLabelStrong}>{item.selectedStop?.nameTc || "載入中…"}</Text></Text>
        <FlatList horizontal data={item.stops} keyExtractor={(stop) => stop.stop} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stopList} renderItem={({ item: stop }) => { const active = item.selectedStop?.stop === stop.stop; return <Pressable onPress={() => void updateCardStop(item, stop)} style={({ pressed }) => [styles.stopChip, active && styles.stopChipActive, pressed && styles.pressed]}><Text style={[styles.stopChipSeq, active && styles.stopChipSeqActive]}>{String(stop.seq).padStart(2, "0")}</Text><Text style={[styles.stopChipName, active && styles.stopChipNameActive]} numberOfLines={1}>{stop.nameTc}</Text></Pressable>; }} />
        <View style={styles.etaList}>
          {item.etas.length > 0 ? item.etas.map((eta, index) => { const highlight = index === 0; return <View key={`${eta.etaSeq}-${eta.eta || eta.remarkTc}`} style={[styles.etaRow, index > 0 && styles.etaRowSecondary, highlight && styles.etaRowHighlight]}><View style={[styles.etaNumberCircle, index > 0 && styles.etaNumberCircleSecondary, highlight && styles.etaNumberCircleHighlight]}><Text style={[styles.etaNumber, index > 0 && styles.etaNumberSecondary, highlight && styles.etaNumberHighlight]}>{index + 1}</Text></View><View style={styles.etaCopy}><Text style={[styles.etaTime, index > 0 && styles.etaTimeSecondary, highlight && styles.etaTimeHighlight]}>{etaLabel(eta)}</Text><Text style={[styles.etaDestination, index > 0 && styles.etaDestinationSecondary]}>{eta.destinationTc}</Text></View><Text style={[styles.etaRemark, index > 0 && styles.etaRemarkSecondary]}>{eta.remarkTc || "預定班次"}</Text></View>; }) : <View style={styles.emptyEta}>{item.isRefreshing ? <ActivityIndicator color={COLORS.accent} /> : <Text style={styles.emptyEtaText}>暫無可用到站資料</Text>}</View>}
        </View>
        <View style={styles.updatedRow}><Text style={styles.updatedText}>上次更新 {formatUpdatedAt(item.updatedAt)} · 30 秒自動刷新</Text>{firstEarlyEta ? <Text style={styles.earlyText}>9 分鐘內</Text> : null}<Pressable onPress={() => void refreshCard(item)} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}><Text style={styles.refreshText}>{item.isRefreshing ? "更新中" : "刷新"}</Text></Pressable></View>
      </View>
    );
  }, [isLandscape, refreshCard, updateCardDirection, updateCardStop]);

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <FlatList
        data={cards}
        keyExtractor={(item) => cardKey(item.route)}
        renderItem={renderCard}
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void loadDefaultRoutes()} tintColor={COLORS.accent} />}
        ListHeaderComponent={<View style={styles.header}><Text style={styles.eyebrow}>HK TRANSIT / LIVE</Text><Text style={styles.title}>香港公共交通到站</Text>{error ? <Text style={styles.error}>{error}</Text> : null}</View>}
        ListEmptyComponent={isSearching ? <ActivityIndicator color={COLORS.accent} style={styles.loading} /> : null}
        ListFooterComponent={<View style={styles.searchCard}><View style={styles.searchCardTop}><Text style={styles.searchIndex}>搜尋</Text><Text style={styles.searchKicker}>加入其他路線</Text></View><View style={styles.searchRow}><TextInput value={query} onChangeText={(value) => { setQuery(value); setRouteChoices([]); }} onSubmitEditing={() => void searchRoute(query)} returnKeyType="search" autoCapitalize="characters" placeholder="例如 91、98D、小巴 103" placeholderTextColor={COLORS.muted} style={styles.searchInput} /><Pressable onPress={() => void searchRoute(query)} style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}>{isSearching ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.searchButtonText}>查詢</Text>}</Pressable></View>{routeChoices.length > 1 ? <View style={styles.choiceBox}><Text style={styles.choiceTitle}>找到多個營辦商，請選擇：</Text><View style={styles.choiceList}>{routeChoices.map((route) => <Pressable key={cardKey(route)} onPress={() => void chooseRoute(route)} style={({ pressed }) => [styles.choiceButton, pressed && styles.pressed]}><View style={styles.choiceButtonTop}><Text style={[styles.operatorTag, route.operator === "GMB" ? styles.operatorTagGmb : route.operator === "KMB" ? styles.operatorTagKmb : styles.operatorTagCtb]}>{operatorLabel(route.operator)}</Text><Text style={styles.choiceRoute}>{route.route}</Text></View><Text style={styles.choiceEndpoints} numberOfLines={1}>{route.directions[0]?.origin || "起點資料暫不可用"} → {route.directions[0]?.destination || "終點資料暫不可用"}</Text></Pressable>)}</View></View> : null}<Text style={styles.searchHint}>支援九巴、城巴及綠色小巴；輸入「小巴 103」會優先顯示綠色小巴。</Text></View>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: COLORS.background },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 12 },
  header: { paddingBottom: 8 },
  eyebrow: { color: COLORS.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: COLORS.accent, fontSize: 22, lineHeight: 27, fontWeight: "800", marginTop: 2 },
  error: { color: "#F3A49B", fontSize: 12, marginTop: 12 },
  loading: { marginVertical: 30 },
  routeCard: { backgroundColor: COLORS.panel, borderColor: COLORS.border, borderWidth: 1, borderRadius: 16, padding: 10, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  routeCardLandscape: { width: "49%" },
  routeCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  routeHeading: { flex: 1 },
  routeCaption: { color: COLORS.accent, fontSize: 14, fontWeight: "800" },
  stopTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800", marginTop: 5 },
  stopCode: { color: COLORS.muted, fontSize: 12, fontWeight: "500" },
  routeBadge: { backgroundColor: COLORS.accentSoft, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  routeBadgeText: { color: COLORS.accent, fontSize: 11, fontWeight: "900" },
  routeIdentityRow: { flexDirection: "row", alignItems: "baseline", marginTop: 2, gap: 8 },
  routeNumber: { color: COLORS.accent, fontSize: 34, lineHeight: 37, fontWeight: "900", letterSpacing: 1, includeFontPadding: false, flexShrink: 0 },
  operatorName: { color: COLORS.accent, fontSize: 14, fontWeight: "900" },
  sectionLabel: { color: COLORS.text, fontSize: 13, fontWeight: "700", marginTop: 5 },
  directionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  directionCard: { flex: 1, minHeight: 48, backgroundColor: COLORS.panelSoft, borderColor: COLORS.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  directionCardActive: { backgroundColor: COLORS.accentDark, borderColor: COLORS.accentDark },
  directionSmall: { color: COLORS.accent, fontSize: 10, fontWeight: "800" },
  directionSmallActive: { color: COLORS.white },
  directionValueRow: { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 4 },
  directionValue: { color: COLORS.text, flex: 1, fontSize: 13, fontWeight: "800" },
  directionValueActive: { color: COLORS.white },
  arrow: { color: COLORS.white, fontSize: 23, lineHeight: 23 },
  selectedLabel: { color: COLORS.accent, fontSize: 12, fontWeight: "800", marginTop: 8 },
  selectedLabelStrong: { color: COLORS.text },
  stopList: { gap: 5, paddingTop: 5, paddingBottom: 2 },
  stopChip: { minWidth: 92, maxWidth: 132, backgroundColor: COLORS.panelSoft, borderColor: COLORS.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
  stopChipActive: { backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent },
  stopChipSeq: { color: COLORS.muted, fontSize: 10, fontWeight: "900" },
  stopChipSeqActive: { color: COLORS.accent },
  stopChipName: { color: COLORS.text, fontSize: 11, fontWeight: "700", marginTop: 2 },
  stopChipNameActive: { color: COLORS.accent },
  etaList: { marginTop: 3 },
  etaRow: { flexDirection: "row", alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, paddingVertical: 5, gap: 8 },
  etaRowSecondary: { paddingVertical: 2 },
  etaRowHighlight: { backgroundColor: "#203332", borderRadius: 8, borderTopColor: "transparent", paddingHorizontal: 5, paddingVertical: 5 },
  etaNumberCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  etaNumberCircleSecondary: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#D7E1DF" },
  etaNumberCircleHighlight: { backgroundColor: COLORS.accent },
  etaNumber: { color: COLORS.background, fontSize: 12, fontWeight: "900" },
  etaNumberSecondary: { fontSize: 10 },
  etaNumberHighlight: { color: COLORS.white },
  etaCopy: { flex: 1 },
  etaTime: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  etaTimeSecondary: { fontSize: 13, fontWeight: "800" },
  etaTimeHighlight: { color: COLORS.warning },
  etaDestination: { color: COLORS.accent, fontSize: 10, marginTop: 1 },
  etaDestinationSecondary: { fontSize: 9 },
  etaRemark: { color: COLORS.muted, fontSize: 10, maxWidth: 72, textAlign: "right" },
  etaRemarkSecondary: { fontSize: 9 },
  emptyEta: { alignItems: "center", paddingVertical: 22 },
  emptyEtaText: { color: COLORS.muted, fontSize: 12 },
  updatedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  updatedText: { color: COLORS.muted, fontSize: 10, flex: 1 },
  earlyText: { color: COLORS.warning, fontSize: 10, fontWeight: "900", backgroundColor: "#3C3520", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  refreshButton: { backgroundColor: COLORS.accentSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  refreshText: { color: COLORS.accent, fontSize: 10, fontWeight: "800" },
  searchCard: { backgroundColor: COLORS.panel, borderColor: COLORS.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 2 },
  searchCardTop: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchIndex: { color: COLORS.accent, fontSize: 12, fontWeight: "900" },
  searchKicker: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  searchInput: { flex: 1, height: 48, color: COLORS.text, borderColor: COLORS.muted, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 20, textAlign: "center", fontWeight: "900" },
  searchButton: { height: 48, minWidth: 70, backgroundColor: COLORS.white, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 15 },
  searchButtonText: { color: COLORS.background, fontSize: 14, fontWeight: "900" },
  searchHint: { color: COLORS.muted, fontSize: 11, marginTop: 9 },
  choiceBox: { marginTop: 12, borderTopColor: COLORS.border, borderTopWidth: 1, paddingTop: 10 },
  choiceTitle: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  choiceList: { gap: 7, marginTop: 8 },
  choiceButton: { backgroundColor: COLORS.panelSoft, borderColor: COLORS.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  choiceButtonTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  operatorTag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: "900" },
  operatorTagGmb: { color: "#7FE3A1", backgroundColor: "#183D2A" },
  operatorTagKmb: { color: "#8FD8FF", backgroundColor: "#17374A" },
  operatorTagCtb: { color: "#F5C77A", backgroundColor: "#49351D" },
  choiceRoute: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  choiceEndpoints: { color: COLORS.muted, fontSize: 11, marginTop: 5 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
