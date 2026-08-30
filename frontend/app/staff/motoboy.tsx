import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { ArrowLeft, ChatCircle, MapPin, Motorcycle, NavigationArrow, SignOut } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, Order } from "@/src/api";
import { brl } from "@/src/format";
import { storage } from "@/src/utils/storage";
import ChatSheet from "@/src/components/ChatSheet";

export default function MotoboyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tracking, setTracking] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [chatOrder, setChatOrder] = useState<Order | null>(null);
  const timerRef = useRef<any>(null);

  const load = async (mid: string) => {
    try { setOrders(await api.motoboyOrders(mid)); } catch {}
  };

  useEffect(() => {
    (async () => {
      const m: any = await storage.getItem("neia:motoboy", null as any);
      if (!m) { router.replace("/(tabs)/profile"); return; }
      setMe(m);
      load(m.id);
    })();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (!me) return;
    const t = setInterval(() => load(me.id), 10000);
    return () => clearInterval(t);
  }, [me]);

  const startDelivery = async (orderId: string) => {
    if (!me) return;
    try {
      await api.motoboyStartDelivery(me.id, orderId);
      await startTracking();
      load(me.id);
    } catch (e: any) { setError(e.message); }
  };

  const startTracking = async () => {
    setError("");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setError("Permissão de localização negada"); return; }
    setTracking(true);
    const push = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await api.motoboyUpdateLocation(me!.id, pos.coords.latitude, pos.coords.longitude);
        setLastPing(new Date().toLocaleTimeString("pt-BR"));
      } catch {}
    };
    push();
    timerRef.current = setInterval(push, 8000);
  };

  const stopTracking = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setTracking(false);
  };

  const complete = async (orderId: string) => {
    if (!me) return;
    await api.motoboyComplete(me.id, orderId);
    stopTracking();
    load(me.id);
  };

  const logout = async () => {
    stopTracking();
    await storage.removeItem("neia:motoboy");
    router.replace("/(tabs)/profile");
  };

  const openMaps = (order: Order) => {
    const lat = (order.customer as any).delivery_lat;
    const lng = (order.customer as any).delivery_lng;
    let url = "";
    if (lat && lng) {
      // Prefer native scheme, fallback to Google Maps web
      if (Platform.OS === "ios") {
        url = `maps://?daddr=${lat},${lng}&dirflg=d`;
      } else if (Platform.OS === "android") {
        url = `google.navigation:q=${lat},${lng}&mode=d`;
      } else {
        url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      }
    } else {
      const addr = encodeURIComponent(order.customer.address + " " + (order.customer.complement || ""));
      url = `https://www.google.com/maps/search/?api=1&query=${addr}`;
    }
    Linking.openURL(url).catch(() => {
      // Fallback web maps
      const fallback = lat && lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customer.address)}`;
      Linking.openURL(fallback).catch(() => {});
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="motoboy-back" onPress={() => router.replace("/(tabs)/profile")} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Olá, {me?.name?.split(" ")[0]}</Text>
          <Text style={styles.subtitle}>{orders.length} entregas atribuídas</Text>
        </View>
        <Pressable testID="motoboy-logout" onPress={logout} style={styles.iconBtn}>
          <SignOut color={COLORS.onSurface} size={18} weight="bold" />
        </Pressable>
      </View>

      <View style={styles.trackingCard}>
        <View style={[styles.dot, tracking ? styles.dotOn : styles.dotOff]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.trackTitle}>GPS {tracking ? "ativo" : "inativo"}</Text>
          <Text style={styles.trackSub}>{tracking ? `Último envio: ${lastPing || "…"}` : "Ative ao iniciar uma entrega"}</Text>
        </View>
        {tracking ? (
          <Pressable testID="stop-tracking" onPress={stopTracking} style={styles.trackBtnOff}>
            <Text style={styles.trackBtnText}>Parar</Text>
          </Pressable>
        ) : (
          <Pressable testID="start-tracking" onPress={startTracking} style={styles.trackBtnOn}>
            <MapPin color={COLORS.surface} size={14} weight="bold" />
            <Text style={styles.trackBtnText}>Iniciar GPS</Text>
          </Pressable>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={orders}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma entrega atribuída</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.code}>#{item.short_code}</Text>
              <Text style={styles.status}>{item.status.replace("_", " ")}</Text>
            </View>
            <Text style={styles.customer}>{item.customer.name} • {item.customer.phone}</Text>
            <Text style={styles.address} numberOfLines={2}>{item.customer.address}</Text>
            <Text style={styles.total}>{brl(item.total)} • {item.payment_method.toUpperCase()}</Text>
            <View style={styles.rowBtns}>
              {item.status !== "saiu_entrega" ? (
                <Pressable testID={`start-${item.id}`} onPress={() => startDelivery(item.id)} style={styles.cta}>
                  <Motorcycle color={COLORS.surface} size={16} weight="fill" />
                  <Text style={styles.ctaText}>Iniciar entrega</Text>
                </Pressable>
              ) : (
                <Pressable testID={`complete-${item.id}`} onPress={() => complete(item.id)} style={styles.ctaSuccess}>
                  <Text style={styles.ctaText}>Marcar como entregue</Text>
                </Pressable>
              )}
              <Pressable testID={`maps-${item.id}`} onPress={() => openMaps(item)} style={styles.mapsBtn}>
                <NavigationArrow color={COLORS.surface} size={18} weight="fill" />
              </Pressable>
              <Pressable testID={`chat-${item.id}`} onPress={() => setChatOrder(item)} style={styles.chatBtn}>
                <ChatCircle color={COLORS.surface} size={18} weight="fill" />
              </Pressable>
            </View>
            <Pressable testID={`maps-full-${item.id}`} onPress={() => openMaps(item)} style={styles.mapsFull}>
              <NavigationArrow color={COLORS.brand} size={16} weight="bold" />
              <Text style={styles.mapsFullText}>Abrir rota no maps</Text>
            </Pressable>
          </View>
        )}
      />

      {chatOrder && (
        <ChatSheet
          orderId={chatOrder.id}
          role="motoboy"
          title={`Chat com ${chatOrder.customer.name}`}
          subtitle={`Pedido #${chatOrder.short_code}`}
          onClose={() => setChatOrder(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: 11, color: COLORS.muted },
  trackingCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, margin: SPACING.lg, padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: COLORS.success },
  dotOff: { backgroundColor: COLORS.borderStrong },
  trackTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  trackSub: { fontSize: 11, color: COLORS.muted },
  trackBtnOn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.brand, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill },
  trackBtnOff: { backgroundColor: COLORS.onSurface, paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill },
  trackBtnText: { color: COLORS.surface, fontWeight: "800", fontSize: 12 },
  empty: { textAlign: "center", padding: SPACING.xxxl, color: COLORS.muted },
  error: { color: COLORS.error, fontSize: 12, textAlign: "center", paddingHorizontal: SPACING.lg },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: 4 },
  cardHead: { flexDirection: "row", justifyContent: "space-between" },
  code: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  status: { fontSize: 11, fontWeight: "800", color: COLORS.warning, textTransform: "uppercase" },
  customer: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
  address: { fontSize: 12, color: COLORS.muted },
  total: { fontSize: 13, fontWeight: "800", color: COLORS.brand, marginTop: 4 },
  cta: { flex: 1, flexDirection: "row", gap: 6, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center", paddingVertical: SPACING.sm, borderRadius: RADIUS.pill },
  ctaSuccess: { flex: 1, backgroundColor: COLORS.success, alignItems: "center", justifyContent: "center", paddingVertical: SPACING.sm, borderRadius: RADIUS.pill },
  ctaText: { color: COLORS.surface, fontWeight: "800", fontSize: 13 },
  rowBtns: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm, alignItems: "center" },
  chatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.info, alignItems: "center", justifyContent: "center" },
  mapsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.success, alignItems: "center", justifyContent: "center" },
  mapsFull: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: SPACING.sm, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.brandTertiary, borderWidth: 1, borderColor: COLORS.brand },
  mapsFullText: { color: COLORS.brand, fontWeight: "800", fontSize: 12 },
});
