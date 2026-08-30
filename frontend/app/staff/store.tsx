import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChatCircleText, Gift, MapPin } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api, Settings } from "@/src/api";
import LocationPicker from "@/src/components/LocationPicker";

export default function StaffStore() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => setSettings(await api.adminGetSettings());
  useEffect(() => { load(); }, []);

  const set = <K extends keyof Settings>(k: K, v: any) => {
    if (!settings) return;
    setSettings({ ...settings, [k]: v });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.adminUpdateSettings({
        store_name: settings.store_name,
        store_address: settings.store_address,
        store_lat: settings.store_lat,
        store_lng: settings.store_lng,
        base_delivery_fee: Number(settings.base_delivery_fee),
        per_km_fee: Number(settings.per_km_fee),
        min_delivery_fee: Number(settings.min_delivery_fee),
        max_delivery_km: Number(settings.max_delivery_km),
        auto_whatsapp: settings.auto_whatsapp,
        admin_phone: settings.admin_phone,
        open_days: settings.open_days,
        open_time: settings.open_time,
        close_time: settings.close_time,
        birthday_coupon_pct: Number(settings.birthday_coupon_pct),
      });
      setSettings(updated);
      Alert.alert("Salvo", "Configurações atualizadas.");
    } catch (e: any) { Alert.alert("Erro", e.message); }
    finally { setSaving(false); }
  };

  if (!settings) return <View style={styles.root}><Text style={{ color: COLORS.muted, textAlign: "center", padding: 40 }}>Carregando…</Text></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable testID="store-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>Loja & Taxa por km</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Section title="Loja">
          <Field label="Nome"><TextInput testID="s-name" value={settings.store_name} onChangeText={(t) => set("store_name", t)} style={styles.input} /></Field>
          <Field label="Endereço da loja"><TextInput testID="s-addr" value={settings.store_address} onChangeText={(t) => set("store_address", t)} style={styles.input} multiline /></Field>
        </Section>

        <Section title="Localização no mapa">
          <LocationPicker
            lat={settings.store_lat} lng={settings.store_lng}
            storeLat={settings.store_lat} storeLng={settings.store_lng}
            onChange={(la, ln) => { set("store_lat", la); set("store_lng", ln); }}
          />
          <View style={styles.coordsRow}>
            <MapPin color={COLORS.muted} size={14} />
            <Text style={styles.coords}>{settings.store_lat.toFixed(4)}, {settings.store_lng.toFixed(4)}</Text>
          </View>
        </Section>

        <Section title="Taxa por km">
          <Field label="Taxa base (até 3 km) — R$">
            <TextInput testID="s-base" value={String(settings.base_delivery_fee)} onChangeText={(t) => set("base_delivery_fee", t.replace(",", "."))} keyboardType="numeric" style={styles.input} />
          </Field>
          <Field label="Por km adicional — R$">
            <TextInput testID="s-perkm" value={String(settings.per_km_fee)} onChangeText={(t) => set("per_km_fee", t.replace(",", "."))} keyboardType="numeric" style={styles.input} />
          </Field>
          <Field label="Mínimo — R$">
            <TextInput testID="s-min" value={String(settings.min_delivery_fee)} onChangeText={(t) => set("min_delivery_fee", t.replace(",", "."))} keyboardType="numeric" style={styles.input} />
          </Field>
          <Field label="Raio máximo — km">
            <TextInput testID="s-max" value={String(settings.max_delivery_km)} onChangeText={(t) => set("max_delivery_km", t.replace(",", "."))} keyboardType="numeric" style={styles.input} />
          </Field>
        </Section>

        <Section title="Dias e horário de funcionamento">
          <View style={styles.daysRow}>
            {["D", "S", "T", "Q", "Q", "S", "S"].map((letter, idx) => {
              const active = (settings.open_days || []).includes(idx);
              return (
                <Pressable
                  key={idx}
                  testID={`day-${idx}`}
                  onPress={() => {
                    const cur = settings.open_days || [];
                    const next = active ? cur.filter((d) => d !== idx) : [...cur, idx].sort();
                    set("open_days", next);
                  }}
                  style={[styles.dayChip, active && styles.dayChipOn]}
                >
                  <Text style={[styles.dayText, active && styles.dayTextOn]}>{letter}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.timeRow}>
            <Field label="Abre">
              <TextInput testID="s-open" value={settings.open_time} onChangeText={(t) => set("open_time", t)} placeholder="10:00" style={styles.input} />
            </Field>
            <Field label="Fecha">
              <TextInput testID="s-close" value={settings.close_time} onChangeText={(t) => set("close_time", t)} placeholder="20:00" style={styles.input} />
            </Field>
          </View>
        </Section>

        <Section title="Cupom de aniversário">
          <View style={styles.giftRow}>
            <Gift color={COLORS.brand} size={22} weight="fill" />
            <Text style={styles.giftText}>Desconto para aniversariantes</Text>
          </View>
          <Field label="% de desconto">
            <TextInput testID="s-birthday-pct" value={String(settings.birthday_coupon_pct)} onChangeText={(t) => set("birthday_coupon_pct", t.replace(/\D/g, ""))} keyboardType="numeric" style={styles.input} />
          </Field>
        </Section>

        <Section title="Aviso automático no WhatsApp">
          <Pressable testID="auto-wa-toggle" onPress={() => set("auto_whatsapp", !settings.auto_whatsapp)} style={[styles.toggleCard, settings.auto_whatsapp && styles.toggleCardOn]}>
            <ChatCircleText color={settings.auto_whatsapp ? "#128C7E" : COLORS.muted} size={22} weight={settings.auto_whatsapp ? "fill" : "regular"} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleTitle, settings.auto_whatsapp && { color: "#128C7E" }]}>{settings.auto_whatsapp ? "Ligado" : "Desligado"}</Text>
              <Text style={styles.toggleSub}>
                {settings.twilio_ready
                  ? "Servidor enviará o WhatsApp direto para o cliente"
                  : "Sem Twilio configurado — abre o wa.me no seu celular ao mudar status"}
              </Text>
            </View>
            <View style={[styles.switch, settings.auto_whatsapp && styles.switchOn]}>
              <View style={[styles.knob, settings.auto_whatsapp && styles.knobOn]} />
            </View>
          </Pressable>
          <View style={[styles.tw, settings.twilio_ready ? styles.twOn : styles.twOff]}>
            <Text style={styles.twText}>
              {settings.twilio_ready
                ? "✅ Twilio configurado — envio pelo servidor ativo"
                : "⚠️ Twilio não configurado — preencha TWILIO_* em Publish → Secrets para envio automático pelo servidor"}
            </Text>
          </View>
        </Section>

        <Pressable testID="store-save" onPress={save} disabled={saving} style={[styles.cta, saving && { opacity: 0.6 }]}>
          <Text style={styles.ctaText}>{saving ? "Salvando…" : "Salvar configurações"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const Section = ({ title, children }: any) => (
  <View style={{ gap: SPACING.sm }}>
    <Text style={styles.section}>{title}</Text>
    <View style={{ gap: SPACING.sm }}>{children}</View>
  </View>
);
const Field = ({ label, children }: any) => (
  <View style={{ gap: 4 }}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  section: { fontSize: 12, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: SPACING.sm },
  label: { fontSize: 11, fontWeight: "700", color: COLORS.muted },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 14, color: COLORS.onSurface },
  coordsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  coords: { fontSize: 11, color: COLORS.muted, fontWeight: "600" },
  toggleCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  toggleCardOn: { borderColor: "#128C7E", backgroundColor: "#E9F9EF" },
  toggleTitle: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  toggleSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  switch: { width: 42, height: 24, borderRadius: 12, backgroundColor: COLORS.borderStrong, padding: 2 },
  switchOn: { backgroundColor: "#25D366" },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.surface },
  knobOn: { transform: [{ translateX: 18 }] },
  daysRow: { flexDirection: "row", gap: SPACING.xs, justifyContent: "space-between" },
  dayChip: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  dayChipOn: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  dayText: { fontSize: 14, fontWeight: "800", color: COLORS.onSurface },
  dayTextOn: { color: COLORS.surface },
  timeRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  giftRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm },
  giftText: { fontSize: 14, fontWeight: "700", color: COLORS.onSurface },
  tw: { padding: SPACING.md, borderRadius: RADIUS.md, marginTop: SPACING.sm },
  twOn: { backgroundColor: "#DFF0E7" },
  twOff: { backgroundColor: "#FFF3D8" },
  twText: { fontSize: 12, fontWeight: "700", color: COLORS.onSurface },
  cta: { backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center", marginTop: SPACING.md },
  ctaText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
});
