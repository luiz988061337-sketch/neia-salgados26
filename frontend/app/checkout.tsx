import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CalendarBlank, CheckCircle, Clock, CreditCard, Money, QrCode } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, CartItem, clearCart, getCart, getCustomer, saveCustomer, Settings, StoreStatus } from "@/src/api";
import { brl } from "@/src/format";
import { computeFee, haversineKm } from "@/src/geo";
import LocationPicker from "@/src/components/LocationPicker";

type Payment = "pix" | "dinheiro" | "cartao";

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [complement, setComplement] = useState("");
  const [birthday, setBirthday] = useState(""); // MM-DD or empty
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [store, setStore] = useState<StoreStatus | null>(null);
  const [payment, setPayment] = useState<Payment>("pix");
  const [changeFor, setChangeFor] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponPct, setCouponPct] = useState(0);
  const [notes, setNotes] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduled, setScheduled] = useState<Date>(() => {
    const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 3); return d;
  });
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    getCart().then(setItems);
    api.getSettings().then(setSettings).catch(() => {});
    api.storeStatus().then((s) => { setStore(s); if (!s.is_open) setScheduleEnabled(true); }).catch(() => {});
    getCustomer().then((c: any) => {
      if (c) {
        setName(c.name || ""); setPhone(c.phone || ""); setAddress(c.address || "");
        setComplement(c.complement || "");
        setBirthday(c.birthday || "");
        if (c.delivery_lat && c.delivery_lng) { setLat(c.delivery_lat); setLng(c.delivery_lng); }
      }
    });
  }, []));

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const distanceKm = lat && lng && settings
    ? Number(haversineKm(settings.store_lat, settings.store_lng, lat, lng).toFixed(2))
    : null;
  const delivery = settings ? computeFee(distanceKm, settings) : 8;
  const discount = Number((subtotal * (couponPct / 100)).toFixed(2));
  const total = subtotal + delivery - discount;
  const outOfRange = settings && distanceKm != null && distanceKm > settings.max_delivery_km;

  const applyCoupon = async () => {
    if (!coupon) return;
    try {
      const c = await api.validateCoupon(coupon.toUpperCase());
      setCouponPct(c.discount_percent); setError("");
    } catch (e: any) { setError(e.message); setCouponPct(0); }
  };

  const submit = async () => {
    if (!name || !phone || !address) { setError("Preencha nome, telefone e endereço"); return; }
    if (!lat || !lng) { setError("Defina o local de entrega no mapa"); return; }
    if (outOfRange) { setError("Endereço fora da área de entrega"); return; }
    if (store && !store.is_open && !scheduleEnabled) {
      setError("Loja fechada — agende sua entrega para outro horário");
      return;
    }
    setSubmitting(true); setError("");
    try {
      const cust = { name, phone, address, complement, delivery_lat: lat, delivery_lng: lng, birthday };
      await saveCustomer(cust);
      const order = await api.createOrder({
        customer: cust, items, payment_method: payment,
        change_for: payment === "dinheiro" && changeFor ? Number(changeFor.replace(",", ".")) : null,
        coupon_code: couponPct ? coupon.toUpperCase() : null,
        notes,
        scheduled_for: scheduleEnabled ? scheduled.toISOString() : null,
      });
      await clearCart();
      router.replace({ pathname: "/order/[id]", params: { id: order.id } });
    } catch (e: any) {
      setError(e.message || "Erro ao finalizar pedido");
    } finally { setSubmitting(false); }
  };

  const formatDateBR = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  const formatTimeBR = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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
        {store && !store.is_open && (
          <View style={styles.closedBanner}>
            <Text style={{ fontSize: 22 }}>🌙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.closedTitle}>Loja fechada agora</Text>
              <Text style={styles.closedSub}>Você precisa agendar sua entrega para um horário aberto ({store.open_time}–{store.close_time}).</Text>
            </View>
          </View>
        )}

        <Section title="Seus dados">
          <Input testID="name-input" label="Nome completo" value={name} onChangeText={setName} />
          <Input testID="phone-input" label="Telefone (WhatsApp)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Input
            testID="birthday-input" label="Aniversário — MM-DD (opcional, para cupom especial 🎂)"
            value={birthday} onChangeText={setBirthday} placeholder="03-15" maxLength={5}
          />
        </Section>

        <Section title="Endereço de entrega">
          <Input testID="address-input" label="Rua, número, bairro, cidade" value={address} onChangeText={setAddress} multiline />
          <Input testID="complement-input" label="Complemento (apto, referência)" value={complement} onChangeText={setComplement} />
        </Section>

        <Section title="Localização no mapa">
          {settings && (
            <LocationPicker
              lat={lat} lng={lng}
              storeLat={settings.store_lat} storeLng={settings.store_lng}
              onChange={(la, ln) => { setLat(la); setLng(ln); }}
            />
          )}
          {distanceKm != null && (
            <View style={[styles.distancePill, outOfRange && { backgroundColor: "#F3D8D3" }]}>
              <Text style={[styles.distanceText, outOfRange && { color: COLORS.error }]}>
                {distanceKm} km da loja • Taxa {brl(delivery)}
                {outOfRange && " (fora da área)"}
              </Text>
            </View>
          )}
        </Section>

        <Section title="Agendar entrega (opcional)">
          <Pressable testID="schedule-toggle" onPress={() => setScheduleEnabled((v) => !v)} style={[styles.toggleCard, scheduleEnabled && styles.toggleCardOn]}>
            <CalendarBlank color={scheduleEnabled ? COLORS.brand : COLORS.muted} size={20} weight={scheduleEnabled ? "fill" : "regular"} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleTitle, scheduleEnabled && { color: COLORS.brand }]}>
                {scheduleEnabled ? "Entrega agendada" : "Entregar assim que pronto"}
              </Text>
              <Text style={styles.toggleSub}>
                {scheduleEnabled ? "Escolha o dia e horário abaixo" : "Toque para agendar para depois"}
              </Text>
            </View>
            <View style={[styles.switch, scheduleEnabled && styles.switchOn]}>
              <View style={[styles.knob, scheduleEnabled && styles.knobOn]} />
            </View>
          </Pressable>

          {scheduleEnabled && (
            <View style={styles.scheduleRow}>
              <Pressable testID="pick-date" onPress={() => setShowDate(true)} style={styles.datePill}>
                <CalendarBlank color={COLORS.brand} size={16} weight="fill" />
                <Text style={styles.datePillText}>{formatDateBR(scheduled)}</Text>
              </Pressable>
              <Pressable testID="pick-time" onPress={() => setShowTime(true)} style={styles.datePill}>
                <Clock color={COLORS.brand} size={16} weight="fill" />
                <Text style={styles.datePillText}>{formatTimeBR(scheduled)}</Text>
              </Pressable>
            </View>
          )}

          {showDate && (
            <DateTimePicker
              value={scheduled} mode="date" display="default"
              minimumDate={new Date()}
              onChange={(_, d) => { setShowDate(false); if (d) { const n = new Date(scheduled); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setScheduled(n); } }}
            />
          )}
          {showTime && (
            <DateTimePicker
              value={scheduled} mode="time" display="default"
              onChange={(_, d) => { setShowTime(false); if (d) { const n = new Date(scheduled); n.setHours(d.getHours(), d.getMinutes(), 0, 0); setScheduled(n); } }}
            />
          )}
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
              testID="coupon-input" value={coupon} onChangeText={setCoupon}
              autoCapitalize="characters" placeholder="NEIA10" placeholderTextColor={COLORS.muted} style={styles.couponInput}
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
          <SumRow label={`Entrega${distanceKm != null ? ` • ${distanceKm} km` : ""}`} val={brl(delivery)} />
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
  textInput: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, color: COLORS.onSurface, minHeight: 44 },
  distancePill: { alignSelf: "flex-start", paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.brandTertiary },
  distanceText: { fontSize: 12, fontWeight: "800", color: COLORS.onBrandTertiary },
  toggleCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  toggleCardOn: { borderColor: COLORS.brand, backgroundColor: COLORS.brandTertiary },
  toggleTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  toggleSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  switch: { width: 42, height: 24, borderRadius: 12, backgroundColor: COLORS.borderStrong, padding: 2 },
  switchOn: { backgroundColor: COLORS.brand },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.surface },
  knobOn: { transform: [{ translateX: 18 }] },
  scheduleRow: { flexDirection: "row", gap: SPACING.sm },
  datePill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.brand, backgroundColor: COLORS.surface },
  datePillText: { color: COLORS.brand, fontWeight: "800", fontSize: 13 },
  payOpt: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
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
  closedBanner: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, backgroundColor: "#FFF3D8", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.warning },
  closedTitle: { fontSize: 14, fontWeight: "800", color: COLORS.warning },
  closedSub: { fontSize: 12, color: COLORS.warning, marginTop: 2 },
});
