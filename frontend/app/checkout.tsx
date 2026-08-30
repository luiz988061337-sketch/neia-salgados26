import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle, CreditCard, Money, QrCode, MapPin } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, CartItem, clearCart, getCart, getCustomer, Neighborhood, saveCustomer } from "@/src/api";
import { brl } from "@/src/format";

type Payment = "pix" | "dinheiro" | "cartao";

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [neighborhoodId, setNeighborhoodId] = useState<string>("");
  const [payment, setPayment] = useState<Payment>("pix");
  const [changeFor, setChangeFor] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponPct, setCouponPct] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    getCart().then(setItems);
    api.listNeighborhoods().then((n) => {
      setNeighborhoods(n);
      if (n.length && !neighborhoodId) setNeighborhoodId(n[0].id);
    }).catch(() => {});
    getCustomer().then((c: any) => {
      if (c) {
        setName(c.name || ""); setPhone(c.phone || ""); setAddress(c.address || "");
        setComplement(c.complement || "");
        if (c.neighborhood_id) setNeighborhoodId(c.neighborhood_id);
      }
    });
  }, []));

  const selectedNbh = neighborhoods.find((n) => n.id === neighborhoodId);
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const delivery = selectedNbh?.delivery_fee ?? 8.0;
  const discount = Number((subtotal * (couponPct / 100)).toFixed(2));
  const total = subtotal + delivery - discount;

  const applyCoupon = async () => {
    if (!coupon) return;
    try {
      const c = await api.validateCoupon(coupon.toUpperCase());
      setCouponPct(c.discount_percent);
      setError("");
    } catch (e: any) { setError(e.message); setCouponPct(0); }
  };

  const submit = async () => {
    if (!name || !phone || !address) { setError("Preencha nome, telefone e endereço"); return; }
    if (!neighborhoodId) { setError("Selecione o bairro de entrega"); return; }
    setSubmitting(true); setError("");
    try {
      const cust = { name, phone, address, complement, neighborhood_id: neighborhoodId };
      await saveCustomer(cust);
      const order = await api.createOrder({
        customer: cust,
        items,
        payment_method: payment,
        change_for: payment === "dinheiro" && changeFor ? Number(changeFor.replace(",", ".")) : null,
        coupon_code: couponPct ? coupon.toUpperCase() : null,
        notes,
      });
      await clearCart();
      router.replace({ pathname: "/order/[id]", params: { id: order.id } });
    } catch (e: any) {
      setError(e.message || "Erro ao finalizar pedido");
    } finally { setSubmitting(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable testID="checkout-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Finalizar pedido</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
        <Section title="Seus dados">
          <Input testID="name-input" label="Nome completo" value={name} onChangeText={setName} />
          <Input testID="phone-input" label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </Section>

        <Section title="Endereço de entrega">
          <Input testID="address-input" label="Rua, número, cidade" value={address} onChangeText={setAddress} multiline />
          <Input testID="complement-input" label="Complemento (apto, referência)" value={complement} onChangeText={setComplement} />
          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Bairro (taxa por bairro)</Text>
          <View style={{ gap: SPACING.sm }}>
            {neighborhoods.map((n) => {
              const active = n.id === neighborhoodId;
              return (
                <Pressable
                  key={n.id}
                  testID={`nbh-${n.id}`}
                  onPress={() => setNeighborhoodId(n.id)}
                  style={[styles.nbhRow, active && styles.nbhRowActive]}
                >
                  <MapPin color={active ? COLORS.brand : COLORS.muted} size={18} weight={active ? "fill" : "regular"} />
                  <Text style={[styles.nbhName, active && { fontWeight: "800" }]}>{n.name}</Text>
                  <Text style={[styles.nbhFee, active && { color: COLORS.brand }]}>{brl(n.delivery_fee)}</Text>
                </Pressable>
              );
            })}
            {neighborhoods.length === 0 && (
              <Text style={{ color: COLORS.muted, fontSize: 12 }}>Nenhum bairro cadastrado ainda.</Text>
            )}
          </View>
        </Section>

        <Section title="Pagamento">
          <PayOption testID="pay-pix" active={payment === "pix"} onPress={() => setPayment("pix")} icon={<QrCode color={COLORS.brand} size={22} weight={payment === "pix" ? "fill" : "regular"} />} label="Pix" />
          <PayOption testID="pay-dinheiro" active={payment === "dinheiro"} onPress={() => setPayment("dinheiro")} icon={<Money color={COLORS.brand} size={22} weight={payment === "dinheiro" ? "fill" : "regular"} />} label="Dinheiro na entrega" />
          <PayOption testID="pay-cartao" active={payment === "cartao"} onPress={() => setPayment("cartao")} icon={<CreditCard color={COLORS.brand} size={22} weight={payment === "cartao" ? "fill" : "regular"} />} label="Cartão na entrega" />
          {payment === "dinheiro" && (
            <Input testID="change-input" label="Troco para quanto? (opcional)" value={changeFor} onChangeText={setChangeFor} keyboardType="numeric" />
          )}
        </Section>

        <Section title="Cupom">
          <View style={styles.couponRow}>
            <TextInput
              testID="coupon-input"
              value={coupon}
              onChangeText={setCoupon}
              autoCapitalize="characters"
              placeholder="NEIA10"
              placeholderTextColor={COLORS.muted}
              style={styles.couponInput}
            />
            <Pressable testID="coupon-apply-btn" onPress={applyCoupon} style={styles.couponBtn}>
              <Text style={styles.couponBtnText}>Aplicar</Text>
            </Pressable>
          </View>
          {couponPct > 0 && (
            <View style={styles.couponOk}>
              <CheckCircle color={COLORS.success} size={16} weight="fill" />
              <Text style={styles.couponOkText}>Cupom aplicado ({couponPct}% off)</Text>
            </View>
          )}
        </Section>

        <Section title="Observações (opcional)">
          <Input testID="notes-input" label="Alguma observação para a Néia?" value={notes} onChangeText={setNotes} multiline />
        </Section>

        <View style={styles.summary}>
          <SumRow label="Subtotal" val={brl(subtotal)} />
          <SumRow label={`Entrega${selectedNbh ? ` • ${selectedNbh.name}` : ""}`} val={brl(delivery)} />
          {discount > 0 && <SumRow label={`Cupom (${couponPct}%)`} val={`- ${brl(discount)}`} success />}
          <View style={styles.hr} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLbl}>Total</Text>
            <Text style={styles.totalVal}>{brl(total)}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <Pressable testID="submit-order-btn" onPress={submit} disabled={submitting} style={[styles.cta, submitting && { opacity: 0.6 }]}>
          <Text style={styles.ctaText}>{submitting ? "Enviando..." : `Confirmar • ${brl(total)}`}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const Section = ({ title, children }: any) => (
  <View style={{ gap: SPACING.sm }}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={{ gap: SPACING.sm }}>{children}</View>
  </View>
);

const Input = ({ label, testID, ...props }: any) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput testID={testID} placeholderTextColor={COLORS.muted} style={styles.textInput} {...props} />
  </View>
);

const PayOption = ({ active, onPress, icon, label, testID }: any) => (
  <Pressable testID={testID} onPress={onPress} style={[styles.payOpt, active && styles.payOptActive]}>
    {icon}
    <Text style={[styles.payOptText, active && styles.payOptTextActive]}>{label}</Text>
    <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
  </Pressable>
);

const SumRow = ({ label, val, success }: any) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
    <Text style={{ color: COLORS.muted, fontSize: 13 }}>{label}</Text>
    <Text style={{ color: success ? COLORS.success : COLORS.onSurface, fontSize: 13, fontWeight: "700" }}>{val}</Text>
  </View>
);

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: COLORS.muted },
  textInput: {
    backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12,
    fontSize: 14, color: COLORS.onSurface, minHeight: 44,
  },
  payOpt: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  payOptActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brandTertiary },
  payOptText: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.onSurface },
  payOptTextActive: { fontWeight: "800" },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.borderStrong },
  radioActive: { borderColor: COLORS.brand, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.brand },
  couponRow: { flexDirection: "row", gap: SPACING.sm },
  couponInput: { flex: 1, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, color: COLORS.onSurface },
  couponBtn: { paddingHorizontal: SPACING.lg, backgroundColor: COLORS.onSurface, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  couponBtnText: { color: COLORS.surface, fontWeight: "800", fontSize: 13 },
  nbhRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  nbhRowActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brandTertiary },
  nbhName: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.onSurface },
  nbhFee: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  couponOk: { flexDirection: "row", alignItems: "center", gap: 6 },
  couponOkText: { color: COLORS.success, fontSize: 12, fontWeight: "700" },
  summary: { padding: SPACING.md, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, gap: 2 },
  hr: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLbl: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  totalVal: { fontSize: 20, fontWeight: "800", color: COLORS.brand },
  error: { color: COLORS.error, fontSize: 13, fontWeight: "700", textAlign: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, padding: SPACING.lg },
  cta: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center" },
  ctaText: { color: COLORS.surface, fontSize: 15, fontWeight: "800" },
});
