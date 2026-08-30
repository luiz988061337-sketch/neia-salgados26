import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChatCircle, ChatCircleText, CheckCircle, Fire, House, Motorcycle, Phone, Receipt } from "phosphor-react-native";

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
  const pollRef = useRef<any>(null);

  const fetchOrder = async () => {
    if (!id) return;
    try { setOrder(await api.getOrder(id)); } catch {}
  };

  useEffect(() => {
    fetchOrder();
    pollRef.current = setInterval(fetchOrder, 5000);
    return () => clearInterval(pollRef.current);
  }, [id]);

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

        <Pressable
          testID="share-order-whatsapp"
          onPress={() => openWhatsApp(order.customer.phone, orderStatusMessage(order, process.env.EXPO_PUBLIC_BACKEND_URL || ""))}
          style={styles.waShare}
        >
          <ChatCircleText color="#25D366" size={18} weight="fill" />
          <Text style={styles.waShareText}>Compartilhar pedido no WhatsApp</Text>
        </Pressable>

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
    marginHorizontal: SPACING.lg, paddingVertical: 12, borderRadius: RADIUS.pill,
    backgroundColor: "#E9F9EF", borderWidth: 1, borderColor: "#25D366",
  },
  waShareText: { color: "#128C7E", fontWeight: "800", fontSize: 13 },
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
