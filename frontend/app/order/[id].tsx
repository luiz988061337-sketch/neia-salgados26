import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Clipboard, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChatCircle, ChatCircleText, CheckCircle, Copy, Fire, House, Motorcycle, Phone, Receipt, Share as ShareIcon, Star } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, Order } from "@/src/api";
import { brl, statusLabel, timeAgo } from "@/src/format";
import MotoboyMap from "@/src/components/MotoboyMap";
import ChatSheet from "@/src/components/ChatSheet";
import { openWhatsApp, orderStatusMessage } from "@/src/whatsapp";

const STEPS: { key: Order["status"]; label: string; icon: any }[] = [
  { key: "recebido", label: "Recebido", icon: Receipt },
  { key: "fritando", label: "Fritando", icon: Fire },
  { key: "saiu_entrega", label: "Saiu para entrega", icon: Motorcycle },
  { key: "entregue", label: "Entregue", icon: House },
];

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingSaved, setRatingSaved] = useState(false);
  const pollRef = useRef<any>(null);

  const fetchOrder = async () => {
    if (!id) return;
    try {
      const o = await api.getOrder(id);
      setOrder(o);
      const st = (o as any).rating_stars;
      if (st && !rating) { setRating(st); setRatingSaved(true); }
    } catch {}
  };

  useEffect(() => {
    fetchOrder();
    pollRef.current = setInterval(fetchOrder, 5000);
    return () => clearInterval(pollRef.current);
  }, [id]);

  const submitRating = async (stars: number) => {
    if (!order || ratingSaved) return;
    setRating(stars);
    try {
      await api.rateOrder(order.id, stars, "");
      setRatingSaved(true);
      Alert.alert("Obrigado!", "Sua avaliação foi registrada 💛");
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Tente novamente");
    }
  };

  const trackingUrl = order ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/order/${order.id}` : "";

  const shareOrder = async () => {
    if (!order) return;
    const msg = orderStatusMessage(order, process.env.EXPO_PUBLIC_BACKEND_URL || "");
    try {
      await Share.share({ message: msg, url: trackingUrl });
    } catch {}
  };

  const copyLink = () => {
    if (!trackingUrl) return;
    try { (Clipboard as any).setString(trackingUrl); } catch {}
    Alert.alert("Copiado", "Link do pedido copiado!");
  };

  if (!order) {
    return <View style={{ flex: 1, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: COLORS.muted }}>Carregando…</Text>
    </View>;
  }

  const currentIdx = STEPS.findIndex((s) => s.key === order.status);
  const showMap = order.status === "saiu_entrega" && order.motoboy_location?.lat && order.motoboy_location?.lng;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="tracking-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>Pedido #{order.short_code}</Text>
          <Text style={styles.time}>{timeAgo(order.created_at)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {order.status === "recebido" && (
          <View style={styles.successBanner}>
            <CheckCircle color={COLORS.success} size={22} weight="fill" />
            <Text style={styles.successText}>Pedido recebido com sucesso! A Néia já foi notificada.</Text>
          </View>
        )}

        <View style={styles.shareRow}>
          <Pressable
            testID="share-order-whatsapp"
            onPress={() => openWhatsApp(order.customer.phone, orderStatusMessage(order, process.env.EXPO_PUBLIC_BACKEND_URL || ""))}
            style={[styles.waShare, { flex: 1 }]}
          >
            <ChatCircleText color="#25D366" size={18} weight="fill" />
            <Text style={styles.waShareText}>WhatsApp</Text>
          </Pressable>
          <Pressable testID="share-order-native" onPress={shareOrder} style={styles.shareBtnSm}>
            <ShareIcon color={COLORS.brand} size={18} weight="bold" />
          </Pressable>
          <Pressable testID="copy-link" onPress={copyLink} style={styles.shareBtnSm}>
            <Copy color={COLORS.brand} size={18} weight="bold" />
          </Pressable>
        </View>

        {order.scheduled_for && (
          <View style={styles.scheduleBadge}>
            <Text style={styles.scheduleText}>
              🗓️ Agendado para {new Date(order.scheduled_for).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timeline}>
          <Text style={styles.blockTitle}>Status do Pedido</Text>
          <View style={{ marginTop: SPACING.md, gap: SPACING.md }}>
            {STEPS.map((s, idx) => {
              const done = idx <= currentIdx && order.status !== "cancelado";
              const active = idx === currentIdx;
              const Icon = s.icon;
              return (
                <View key={s.key} style={styles.step}>
                  <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                    <Icon color={done ? COLORS.surface : COLORS.muted} size={16} weight={active ? "fill" : "regular"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepLabel, done && { color: COLORS.onSurface, fontWeight: "800" }]}>{s.label}</Text>
                    {active && <Text style={styles.stepSub}>{statusLabel(order.status)}…</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Rating */}
        {(order.status === "entregue" || (order as any).rating_stars) && (
          <View style={styles.ratingBlock}>
            <Text style={styles.blockTitle}>{ratingSaved ? "Sua avaliação" : "Avalie seu pedido"}</Text>
            <Text style={styles.ratingSub}>
              {ratingSaved ? "Obrigado pela sua nota 💛" : "Toque nas estrelas para nos ajudar a melhorar."}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  testID={`star-${n}`}
                  disabled={ratingSaved}
                  onPress={() => submitRating(n)}
                  style={styles.starBtn}
                >
                  <Star
                    color={n <= rating ? COLORS.warning : COLORS.borderStrong}
                    size={34}
                    weight={n <= rating ? "fill" : "regular"}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Map */}
        {showMap && (
          <View style={styles.mapWrap}>
            <Text style={[styles.blockTitle, { paddingHorizontal: SPACING.lg }]}>Motoboy a caminho</Text>
            <MotoboyMap lat={order.motoboy_location!.lat} lng={order.motoboy_location!.lng} name={order.motoboy_location!.name} />
            <View style={styles.motoboyCard}>
              <View style={styles.motoAvatar}><Motorcycle color={COLORS.surface} size={22} weight="fill" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.motoName}>{order.motoboy_location!.name}</Text>
                <Text style={styles.motoPhone}>{order.motoboy_location!.phone}</Text>
              </View>
              <Pressable testID="chat-motoboy" onPress={() => setChatOpen(true)} style={styles.chatBtn}>
                <ChatCircle color={COLORS.surface} size={16} weight="fill" />
              </Pressable>
              <Pressable style={styles.callBtn}>
                <Phone color={COLORS.surface} size={16} weight="bold" />
              </Pressable>
            </View>
          </View>
        )}

        {/* Summary */}
        <View style={styles.summary}>
          <Text style={styles.blockTitle}>Resumo</Text>
          <View style={{ marginTop: SPACING.md, gap: SPACING.sm }}>
            {order.items.map((i, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemQty}>{i.quantity}x</Text>
                <Text style={styles.itemName} numberOfLines={2}>{i.product_name}</Text>
                <Text style={styles.itemPrice}>{brl(i.subtotal)}</Text>
              </View>
            ))}
            <View style={styles.hr} />
            <View style={styles.rowLine}><Text style={styles.sumLbl}>Subtotal</Text><Text style={styles.sumVal}>{brl(order.subtotal)}</Text></View>
            <View style={styles.rowLine}><Text style={styles.sumLbl}>Entrega</Text><Text style={styles.sumVal}>{brl(order.delivery_fee)}</Text></View>
            {order.discount > 0 && <View style={styles.rowLine}><Text style={styles.sumLbl}>Desconto</Text><Text style={[styles.sumVal, { color: COLORS.success }]}>- {brl(order.discount)}</Text></View>}
            <View style={styles.rowLine}><Text style={styles.totLbl}>Total</Text><Text style={styles.totVal}>{brl(order.total)}</Text></View>
          </View>
        </View>

        <View style={styles.addrBlock}>
          <Text style={styles.blockTitle}>Endereço</Text>
          <Text style={styles.addrText}>{order.customer.address}{order.customer.complement ? ` • ${order.customer.complement}` : ""}</Text>
        </View>
      </ScrollView>

      {chatOpen && order.motoboy_name && (
        <ChatSheet
          orderId={order.id}
          role="customer"
          title={`Chat com ${order.motoboy_name}`}
          subtitle={`Pedido #${order.short_code}`}
          onClose={() => setChatOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  code: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  time: { fontSize: 11, color: COLORS.muted },
  successBanner: { flexDirection: "row", gap: SPACING.sm, alignItems: "center", backgroundColor: "#DFF0E7", padding: SPACING.md, margin: SPACING.lg, borderRadius: RADIUS.md },
  successText: { flex: 1, color: COLORS.success, fontWeight: "700", fontSize: 13 },
  waShare: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: RADIUS.pill,
    backgroundColor: "#E9F9EF", borderWidth: 1, borderColor: "#25D366",
  },
  waShareText: { color: "#128C7E", fontWeight: "800", fontSize: 13 },
  shareRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginHorizontal: SPACING.lg },
  shareBtnSm: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brandTertiary,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.brand,
  },
  ratingBlock: { padding: SPACING.lg, marginTop: SPACING.sm, backgroundColor: COLORS.brandTertiary, marginHorizontal: SPACING.lg, borderRadius: RADIUS.md, gap: SPACING.sm },
  ratingSub: { fontSize: 12, color: COLORS.onBrandTertiary, marginTop: 2 },
  starsRow: { flexDirection: "row", justifyContent: "center", gap: SPACING.sm, marginTop: SPACING.sm },
  starBtn: { padding: 4 },
  scheduleBadge: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: "#FFE9D3" },
  scheduleText: { color: COLORS.warning, fontWeight: "800", fontSize: 13, textAlign: "center" },
  blockTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  timeline: { padding: SPACING.lg },
  step: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  stepDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  stepDotDone: { backgroundColor: COLORS.success },
  stepDotActive: { backgroundColor: COLORS.brand },
  stepLabel: { fontSize: 14, color: COLORS.muted, fontWeight: "600" },
  stepSub: { fontSize: 11, color: COLORS.brand, fontWeight: "700", marginTop: 2 },
  mapWrap: { paddingVertical: SPACING.md, gap: SPACING.md },
  map: { width: "100%", height: 260, marginTop: SPACING.sm },
  motoboyCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, marginHorizontal: SPACING.lg, padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  motoAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center" },
  motoName: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  motoPhone: { fontSize: 12, color: COLORS.muted },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.success, alignItems: "center", justifyContent: "center" },
  chatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center" },
  webMapFallback: { margin: SPACING.lg, padding: SPACING.xl, alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md },
  webMapText: { fontSize: 15, fontWeight: "800", color: COLORS.onBrandTertiary },
  webMapSub: { fontSize: 12, color: COLORS.onBrandTertiary },
  summary: { padding: SPACING.lg },
  itemRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  itemQty: { fontSize: 13, fontWeight: "800", color: COLORS.brand, minWidth: 30 },
  itemName: { flex: 1, fontSize: 13, color: COLORS.onSurface, fontWeight: "600" },
  itemPrice: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
  hr: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  rowLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  sumLbl: { color: COLORS.muted, fontSize: 13 },
  sumVal: { color: COLORS.onSurface, fontSize: 13, fontWeight: "700" },
  totLbl: { fontSize: 15, fontWeight: "800", color: COLORS.onSurface, marginTop: 4 },
  totVal: { fontSize: 18, fontWeight: "800", color: COLORS.brand, marginTop: 4 },
  addrBlock: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  addrText: { fontSize: 13, color: COLORS.onSurfaceSecondary, marginTop: 6 },
});
