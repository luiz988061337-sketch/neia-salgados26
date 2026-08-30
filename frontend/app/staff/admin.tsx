import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CaretDown, ChatCircleText, Gear, Printer, X } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, Motoboy, Order, Settings } from "@/src/api";
import { brl, statusLabel, timeAgo } from "@/src/format";
import { openWhatsApp, orderStatusMessage } from "@/src/whatsapp";
import { printOrderReceipt } from "@/src/print";

const STATUS_FLOW: Order["status"][] = ["recebido", "fritando", "saiu_entrega", "entregue", "cancelado"];

export default function Admin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [tab, setTab] = useState<"all" | "delivery" | "pickup" | "scheduled">("all");
  const [assignFor, setAssignFor] = useState<Order | null>(null);
  const [statusFor, setStatusFor] = useState<Order | null>(null);
  const [printers, setPrinters] = useState<any[]>([]);
  const [printFor, setPrintFor] = useState<Order | null>(null);
  const [printing, setPrinting] = useState(false);

  const load = async () => {
    try { setOrders(await api.adminOrders()); } catch {}
    try { setMotoboys(await api.adminMotoboys()); } catch {}
    try { setSettings(await api.adminGetSettings()); } catch {}
    try { setPrinters(await api.adminPrinters()); } catch {}
  };

  const handlePrint = async (order: Order, printerId?: string) => {
    try {
      setPrinting(true);
      await printOrderReceipt(order.id, printerId);
      setPrintFor(null);
    } catch (e: any) {
      // Alert-lite
      console.warn(e.message);
    } finally { setPrinting(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const byTab = orders.filter((o) => {
    if (tab === "scheduled") return !!o.scheduled_for;
    if (tab === "delivery") return (o.fulfillment_type || "delivery") === "delivery" && !o.scheduled_for;
    if (tab === "pickup") return o.fulfillment_type === "pickup" && !o.scheduled_for;
    return true;
  });
  const filtered = filter === "all" ? byTab : byTab.filter((o) => o.status === filter);
  const counts = {
    all: orders.length,
    delivery: orders.filter((o) => (o.fulfillment_type || "delivery") === "delivery" && !o.scheduled_for).length,
    pickup: orders.filter((o) => o.fulfillment_type === "pickup" && !o.scheduled_for).length,
    scheduled: orders.filter((o) => !!o.scheduled_for).length,
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="admin-back" onPress={() => router.replace("/(tabs)/profile")} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Painel Admin</Text>
          <Text style={styles.subtitle}>{orders.length} pedidos totais</Text>
        </View>
        <Pressable testID="admin-settings" onPress={() => router.push("/staff/settings")} style={styles.iconBtn}>
          <Gear color={COLORS.onSurface} size={20} weight="regular" />
        </Pressable>
      </View>

      {/* Tabs de tipo (Entrega / Retirada / Agendados) */}
      <View style={styles.tabsRow}>
        {([
          { id: "all", label: "Todos", emoji: "📋" },
          { id: "delivery", label: "Entrega", emoji: "🛵" },
          { id: "pickup", label: "Retirada", emoji: "🏬" },
          { id: "scheduled", label: "Agendados", emoji: "🗓️" },
        ] as const).map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              testID={`admin-tab-${t.id}`}
              onPress={() => setTab(t.id)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.emoji} {t.label}</Text>
              <Text style={[styles.tabCount, active && styles.tabCountActive]}>{counts[t.id]}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {["all", ...STATUS_FLOW].map((s) => {
          const active = filter === s;
          return (
            <Pressable key={s} testID={`admin-chip-${s}`} onPress={() => setFilter(s)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{s === "all" ? "Todos" : statusLabel(s)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum pedido</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.code}>#{item.short_code}</Text>
              <View style={styles.badgeRow}>
                {item.scheduled_for && <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>🗓️ Agendado</Text></View>}
                {item.fulfillment_type === "pickup"
                  ? <View style={[styles.typeBadge, styles.typeBadgePickup]}><Text style={styles.typeBadgeText}>🏬 Retirada</Text></View>
                  : <View style={[styles.typeBadge, styles.typeBadgeDelivery]}><Text style={styles.typeBadgeText}>🛵 Entrega</Text></View>}
              </View>
              <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
            </View>
            <Text style={styles.customer}>{item.customer.name} • {item.customer.phone}</Text>
            <Text style={styles.address} numberOfLines={2}>{item.customer.address}</Text>
            {item.distance_km != null && <Text style={styles.meta}>📍 {item.distance_km} km da loja</Text>}
            {item.scheduled_for && (
              <Text style={styles.metaSchedule}>
                🗓️ Agendado {new Date(item.scheduled_for).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </Text>
            )}
            <Text style={styles.itemsLine}>
              {item.items.map((i) => `${i.quantity}x ${i.product_name}`).join(", ")}
            </Text>
            <View style={styles.footRow}>
              <Text style={styles.total}>{brl(item.total)} • {item.payment_method.toUpperCase()}</Text>
              {item.motoboy_name && <Text style={styles.moto}>🛵 {item.motoboy_name}</Text>}
            </View>

            <View style={styles.actions}>
              <Pressable testID={`admin-status-${item.id}`} onPress={() => setStatusFor(item)} style={[styles.actionBtn, statusColor(item.status)]}>
                <Text style={[styles.actionText, statusTextColor(item.status)]}>{statusLabel(item.status)}</Text>
                <CaretDown color={statusTextColor(item.status).color} size={12} weight="bold" />
              </Pressable>
              <Pressable testID={`admin-assign-${item.id}`} onPress={() => setAssignFor(item)} style={styles.actionSec}>
                <Text style={styles.actionSecText}>{item.motoboy_name ? "Trocar" : "Atribuir"} motoboy</Text>
              </Pressable>
            </View>
            <Pressable
              testID={`admin-whatsapp-${item.id}`}
              onPress={() => openWhatsApp(item.customer.phone, orderStatusMessage(item, process.env.EXPO_PUBLIC_BACKEND_URL || ""))}
              style={styles.waBtn}
            >
              <ChatCircleText color="#25D366" size={16} weight="fill" />
              <Text style={styles.waText}>Avisar cliente pelo WhatsApp</Text>
            </Pressable>
            <Pressable
              testID={`admin-print-${item.id}`}
              onPress={() => {
                if (printers.length <= 1) handlePrint(item, printers[0]?.id);
                else setPrintFor(item);
              }}
              style={styles.printBtn}
            >
              <Printer color={COLORS.brand} size={16} weight="fill" />
              <Text style={styles.printText}>Imprimir comanda</Text>
            </Pressable>
          </View>
        )}
      />

      {/* Status modal */}
      <Modal visible={!!statusFor} animationType="slide" transparent onRequestClose={() => setStatusFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setStatusFor(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Alterar status</Text>
              <Pressable onPress={() => setStatusFor(null)}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            {STATUS_FLOW.map((s) => (
              <Pressable
                key={s}
                testID={`status-opt-${s}`}
                onPress={async () => {
                  if (statusFor) {
                    await api.adminUpdateStatus(statusFor.id, s);
                    const updated = { ...statusFor, status: s as any };
                    setStatusFor(null);
                    // If auto is enabled and Twilio NOT ready, open wa.me. If Twilio ready, backend already sent.
                    if (settings?.auto_whatsapp && !settings?.twilio_ready) {
                      openWhatsApp(updated.customer.phone, orderStatusMessage(updated, process.env.EXPO_PUBLIC_BACKEND_URL || ""));
                    }
                    load();
                  }
                }}
                style={styles.sheetOpt}
              >
                <Text style={styles.sheetOptText}>{statusLabel(s)}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Assign modal */}
      <Modal visible={!!assignFor} animationType="slide" transparent onRequestClose={() => setAssignFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAssignFor(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Atribuir motoboy</Text>
              <Pressable onPress={() => setAssignFor(null)}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            {motoboys.map((m) => (
              <Pressable
                key={m.id}
                testID={`motoboy-opt-${m.id}`}
                onPress={async () => {
                  if (assignFor) { await api.adminAssign(assignFor.id, m.id); setAssignFor(null); load(); }
                }}
                style={styles.sheetOpt}
              >
                <Text style={styles.sheetOptText}>{m.name}</Text>
                <Text style={styles.sheetOptSub}>{m.phone}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Printer picker */}
      <Modal visible={!!printFor} animationType="slide" transparent onRequestClose={() => setPrintFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPrintFor(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Escolher impressora</Text>
              <Pressable onPress={() => setPrintFor(null)}><X color={COLORS.onSurface} size={22} /></Pressable>
            </View>
            {printers.length === 0 && (
              <Text style={{ color: COLORS.muted, padding: SPACING.md }}>
                Nenhuma impressora cadastrada. Cadastre em Configurações → Impressoras.
              </Text>
            )}
            {printers.map((p) => (
              <Pressable
                key={p.id}
                testID={`printer-opt-${p.id}`}
                disabled={printing}
                onPress={() => printFor && handlePrint(printFor, p.id)}
                style={styles.sheetOpt}
              >
                <Text style={styles.sheetOptText}>
                  {p.name} {p.is_default ? "⭐" : ""}
                </Text>
                <Text style={styles.sheetOptSub}>{p.width_mm}mm {p.model ? `• ${p.model}` : ""}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const statusColor = (s: string) => {
  if (s === "entregue") return { backgroundColor: "#DFF0E7" };
  if (s === "saiu_entrega") return { backgroundColor: "#FFE9D3" };
  if (s === "fritando") return { backgroundColor: COLORS.brandTertiary };
  if (s === "cancelado") return { backgroundColor: "#F3D8D3" };
  return { backgroundColor: COLORS.surfaceSecondary };
};
const statusTextColor = (s: string) => {
  if (s === "entregue") return { color: COLORS.success };
  if (s === "saiu_entrega") return { color: COLORS.warning };
  if (s === "fritando") return { color: COLORS.onBrandTertiary };
  if (s === "cancelado") return { color: COLORS.error };
  return { color: COLORS.onSurface };
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: 11, color: COLORS.muted },
  chipRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm },
  tabsRow: { flexDirection: "row", gap: 4, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary, gap: 2 },
  tabBtnActive: { backgroundColor: COLORS.brand },
  tabText: { fontSize: 10, fontWeight: "800", color: COLORS.onSurface },
  tabTextActive: { color: COLORS.surface },
  tabCount: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  tabCountActive: { color: COLORS.surface },
  badgeRow: { flexDirection: "row", gap: 4, flexShrink: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSecondary },
  typeBadgeText: { fontSize: 10, fontWeight: "800", color: COLORS.onSurface },
  typeBadgeDelivery: { backgroundColor: COLORS.brandTertiary },
  typeBadgePickup: { backgroundColor: "#DFF0E7" },
  chip: { height: 36, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.onSurface },
  chipTextActive: { color: COLORS.surface },
  empty: { textAlign: "center", padding: SPACING.xxxl, color: COLORS.muted },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: 4 },
  cardHead: { flexDirection: "row", justifyContent: "space-between" },
  code: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  time: { fontSize: 11, color: COLORS.muted },
  customer: { fontSize: 13, fontWeight: "700", color: COLORS.onSurface },
  address: { fontSize: 12, color: COLORS.muted },
  meta: { fontSize: 11, color: COLORS.info, fontWeight: "700", marginTop: 2 },
  metaSchedule: { fontSize: 11, color: COLORS.warning, fontWeight: "800", marginTop: 2 },
  itemsLine: { fontSize: 12, color: COLORS.onSurfaceSecondary, marginTop: 4 },
  footRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  total: { fontSize: 14, fontWeight: "800", color: COLORS.brand },
  moto: { fontSize: 12, color: COLORS.info, fontWeight: "700" },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: RADIUS.pill },
  actionText: { fontSize: 12, fontWeight: "800" },
  actionSec: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.brand, alignItems: "center" },
  actionSecText: { fontSize: 12, fontWeight: "800", color: COLORS.brand },
  waBtn: {
    marginTop: SPACING.sm, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
    paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: "#25D366", backgroundColor: "#E9F9EF",
  },
  waText: { fontSize: 12, fontWeight: "800", color: "#128C7E" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: COLORS.overlay },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.xxl },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.sm },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  sheetOpt: { padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  sheetOptText: { fontSize: 14, fontWeight: "700", color: COLORS.onSurface },
  sheetOptSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
});
