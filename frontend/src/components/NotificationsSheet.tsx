import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, BellSlash, X } from "phosphor-react-native";

import { api, AppNotification } from "@/src/api";
import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { timeAgo } from "@/src/format";

export default function NotificationsSheet({ phone, onClose }: { phone: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.listNotifications(phone);
        setItems(r.items);
        await api.markAllRead(phone);
      } catch {}
    })();
  }, [phone]);

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <View style={styles.head}>
          <Bell color={COLORS.brand} size={22} weight="fill" />
          <Text style={styles.title}>Notificações</Text>
          <Pressable testID="notif-close" onPress={onClose} style={styles.closeBtn}>
            <X color={COLORS.onSurface} size={20} />
          </Pressable>
        </View>
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <BellSlash color={COLORS.muted} size={40} weight="light" />
              <Text style={styles.emptyText}>Sem notificações ainda</Text>
              <Text style={styles.emptySub}>Cadastre seu telefone em "Meus Pedidos" para receber avisos.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`notif-${item.id}`}
              onPress={() => {
                onClose();
                if (item.order_id) router.push({ pathname: "/order/[id]", params: { id: item.order_id } });
              }}
              style={[styles.card, !item.read && styles.cardUnread]}
            >
              {!item.read && <View style={styles.dot} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
                <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLORS.overlay, justifyContent: "flex-end", zIndex: 50 },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, maxHeight: "82%", minHeight: "55%" },
  head: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { flex: 1, fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: SPACING.xxl, gap: SPACING.sm },
  emptyText: { fontSize: 15, fontWeight: "700", color: COLORS.muted },
  emptySub: { fontSize: 12, color: COLORS.muted, textAlign: "center", paddingHorizontal: SPACING.lg },
  card: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cardUnread: { backgroundColor: COLORS.brandTertiary, borderColor: COLORS.brand },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.brand },
  cardTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  cardBody: { fontSize: 12, color: COLORS.onSurfaceSecondary, marginTop: 2 },
  cardTime: { fontSize: 10, color: COLORS.muted, marginTop: 4 },
});
