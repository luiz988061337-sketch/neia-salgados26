import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Clipboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretRight, ChatCircleText, Copy, Gift, Lock, MapPin, Motorcycle, Phone, ShieldCheck, Storefront, Trophy, UsersThree } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, getCustomer } from "@/src/api";
import { openWhatsApp } from "@/src/whatsapp";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [me, setMe] = useState<any>(null);

  useFocusEffect(useCallback(() => {
    getCustomer().then((c: any) => {
      if (c?.phone) api.getMe(c.phone).then(setMe).catch(() => {});
    });
  }, []));

  const shareCode = () => {
    if (!me?.referral_code) return;
    const msg = `Olá! Eu compro salgados na Néia Salgados 🥟. Use meu código ${me.referral_code} no primeiro pedido e ganhe 10% de desconto!`;
    openWhatsApp("", msg);
  };
  const copyCode = () => {
    if (!me?.referral_code) return;
    try { (Clipboard as any).setString(me.referral_code); } catch {}
    Alert.alert("Copiado", `${me.referral_code} copiado`);
  };

  const reloadMe = async () => {
    const c = await getCustomer();
    if (c?.phone) { try { setMe(await api.getMe(c.phone)); } catch {} }
  };

  const redeem = (points: number) => {
    if (!me?.phone) return;
    Alert.alert(
      "Resgatar pontos",
      `Trocar ${points} pontos por um cupom de ${Math.min(25, (points/100)*5)}% off?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Resgatar", onPress: async () => {
          try {
            const r = await api.redeemPoints(me.phone, points);
            Alert.alert("🎉 Cupom gerado!", `${r.code} — ${r.discount_percent}% off`);
            await reloadMe();
          } catch (e: any) {
            Alert.alert("Erro", e.message || "Falha ao resgatar");
          }
        } },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}><Text style={styles.title}>Perfil</Text></View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 60 }}>
        <View style={styles.brandCard}>
          <Storefront color={COLORS.brand} size={28} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandName}>Néia Salgados</Text>
            <Text style={styles.brandSub}>Salgados fritos e congelados de qualidade</Text>
          </View>
        </View>

        {me?.phone && (
          <>
            <Text style={styles.section}>Programa Fidelidade</Text>
            <View style={styles.loyaltyCard}>
              <View style={styles.loyHead}>
                <Trophy color={COLORS.warning} size={26} weight="fill" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.loyTitle}>Seus pontos</Text>
                  <Text style={styles.loySub}>Ganhe 1 ponto a cada R$ 1 pedido</Text>
                </View>
                <Text testID="loyalty-points" style={styles.loyPts}>{me?.points ?? 0}</Text>
              </View>
              <View style={styles.loyBar}>
                <View style={[styles.loyFill, { width: `${Math.min(100, ((me?.points ?? 0) % 100))}%` }]} />
              </View>
              <Text style={styles.loyProgress}>
                {(me?.points ?? 0) < 100
                  ? `Faltam ${100 - ((me?.points ?? 0) % 100)} pts para o próximo cupom (5% off)`
                  : `Você pode resgatar ${Math.floor((me?.points ?? 0) / 100) * 5}% off (máx 25%)`}
              </Text>
              <View style={styles.redeemRow}>
                <Pressable testID="redeem-100" disabled={(me?.points ?? 0) < 100} onPress={() => redeem(100)}
                  style={[styles.redeemBtn, (me?.points ?? 0) < 100 && styles.redeemBtnDisabled]}>
                  <Text style={[styles.redeemText, (me?.points ?? 0) < 100 && { color: COLORS.muted }]}>100 pts → 5% off</Text>
                </Pressable>
                <Pressable testID="redeem-200" disabled={(me?.points ?? 0) < 200} onPress={() => redeem(200)}
                  style={[styles.redeemBtn, (me?.points ?? 0) < 200 && styles.redeemBtnDisabled]}>
                  <Text style={[styles.redeemText, (me?.points ?? 0) < 200 && { color: COLORS.muted }]}>200 pts → 10% off</Text>
                </Pressable>
                <Pressable testID="redeem-500" disabled={(me?.points ?? 0) < 500} onPress={() => redeem(500)}
                  style={[styles.redeemBtn, (me?.points ?? 0) < 500 && styles.redeemBtnDisabled]}>
                  <Text style={[styles.redeemText, (me?.points ?? 0) < 500 && { color: COLORS.muted }]}>500 pts → 25% off</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {me?.referral_code && (
          <>
            <Text style={styles.section}>Indique amigos</Text>
            <View style={styles.refCard}>
              <View style={styles.refHead}><Gift color={COLORS.brand} size={22} weight="fill" /><Text style={styles.refTitle}>Seu código</Text></View>
              <View style={styles.codeBox}>
                <Text testID="referral-code" style={styles.code}>{me.referral_code}</Text>
                <Pressable testID="copy-code" onPress={copyCode} style={styles.copyBtn}><Copy color={COLORS.brand} size={18} weight="bold" /></Pressable>
              </View>
              <Text style={styles.refDesc}>Compartilhe com amigos! Cada um que pedir pela 1ª vez usando seu código ganha 10% off — e você ganha um cupom pessoal de 10% 💛</Text>
              <View style={styles.refStats}>
                <View style={styles.stat}><UsersThree color={COLORS.brand} size={18} weight="fill" /><Text style={styles.statVal}>{me.referrals_used || 0}</Text><Text style={styles.statLbl}>indicações</Text></View>
                <View style={styles.stat}><Gift color={COLORS.success} size={18} weight="fill" /><Text style={styles.statVal}>{(me.credits || []).length}</Text><Text style={styles.statLbl}>cupons</Text></View>
              </View>
              <Pressable testID="share-code-whatsapp" onPress={shareCode} style={styles.shareBtn}>
                <ChatCircleText color={COLORS.surface} size={16} weight="fill" /><Text style={styles.shareText}>Compartilhar no WhatsApp</Text>
              </Pressable>
              {(me.credits || []).length > 0 && (
                <View style={{ gap: 4, marginTop: SPACING.md }}>
                  <Text style={styles.creditsHead}>Seus cupons:</Text>
                  {me.credits.map((c: any) => (
                    <View key={c.code} style={styles.creditRow}>
                      <Text style={styles.creditCode}>{c.code}</Text><Text style={styles.creditPct}>{c.discount_percent}% off</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        <Text style={styles.section}>Área da Equipe</Text>
        <View style={styles.card}>
          <Pressable testID="staff-motoboy-btn" onPress={() => router.push({ pathname: "/staff/login", params: { role: "motoboy" } })} style={styles.rowP}>
            <Motorcycle color={COLORS.brand} size={20} /><Text style={styles.rowLabel}>Sou Moto Boy</Text><CaretRight color={COLORS.muted} size={16} />
          </Pressable>
          <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md }} />
          <Pressable testID="staff-admin-btn" onPress={() => router.push({ pathname: "/staff/login", params: { role: "admin" } })} style={styles.rowP}>
            <ShieldCheck color={COLORS.brand} size={20} /><Text style={styles.rowLabel}>Sou Administrador</Text><CaretRight color={COLORS.muted} size={16} />
          </Pressable>
        </View>

        <View style={styles.footer}><Lock color={COLORS.muted} size={14} /><Text style={styles.footerText}>Sem cadastro • Sem senha para clientes</Text></View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.onSurface },
  brandCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md },
  brandName: { fontSize: 18, fontWeight: "800", color: COLORS.onBrandTertiary },
  brandSub: { fontSize: 12, color: COLORS.onBrandTertiary, marginTop: 2 },
  section: { fontSize: 12, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", marginTop: SPACING.md, letterSpacing: 0.5 },
  refCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.brand, padding: SPACING.md, gap: SPACING.sm },
  refHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  refTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  codeBox: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.md, borderStyle: "dashed", borderWidth: 1, borderColor: COLORS.brand },
  code: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.onBrandTertiary, letterSpacing: 1 },
  copyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  refDesc: { fontSize: 12, color: COLORS.muted, lineHeight: 17 },
  refStats: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  stat: { flex: 1, alignItems: "center", padding: SPACING.sm, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, gap: 2 },
  statVal: { fontSize: 20, fontWeight: "800", color: COLORS.onSurface },
  statLbl: { fontSize: 10, color: COLORS.muted, fontWeight: "600", textAlign: "center" },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#25D366", paddingVertical: 12, borderRadius: RADIUS.pill, marginTop: SPACING.sm },
  shareText: { color: COLORS.surface, fontWeight: "800", fontSize: 14 },
  creditsHead: { fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase" },
  creditRow: { flexDirection: "row", justifyContent: "space-between", padding: SPACING.sm, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md },
  creditCode: { fontSize: 13, fontWeight: "800", color: COLORS.onSurface },
  creditPct: { fontSize: 13, fontWeight: "800", color: COLORS.success },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  loyaltyCard: { backgroundColor: "#FFF8E7", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.warning, padding: SPACING.md, gap: SPACING.sm },
  loyHead: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  loyTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  loySub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  loyPts: { fontSize: 26, fontWeight: "800", color: COLORS.warning },
  loyBar: { height: 8, borderRadius: 4, backgroundColor: COLORS.surface, overflow: "hidden", marginTop: 4 },
  loyFill: { height: "100%", backgroundColor: COLORS.warning, borderRadius: 4 },
  loyProgress: { fontSize: 11, color: COLORS.onSurfaceSecondary, fontWeight: "700" },
  redeemRow: { flexDirection: "row", gap: 6, marginTop: SPACING.sm, flexWrap: "wrap" },
  redeemBtn: { flex: 1, minWidth: 100, paddingVertical: 10, paddingHorizontal: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.warning, alignItems: "center" },
  redeemBtnDisabled: { backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border },
  redeemText: { color: COLORS.surface, fontWeight: "800", fontSize: 11, textAlign: "center" },
  rowP: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.onSurface },
  footer: { marginTop: SPACING.xl, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  footerText: { color: COLORS.muted, fontSize: 12 },
});
