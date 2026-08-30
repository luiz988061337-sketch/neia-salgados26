import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Lock } from "phosphor-react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";

export default function StaffLogin() {
  const { role } = useLocalSearchParams<{ role: "motoboy" | "admin" }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isAdmin = role === "admin";

  const login = async () => {
    setLoading(true); setError("");
    try {
      if (isAdmin) {
        await api.adminLogin(password);
        await storage.secureSet("neia:admin", true);
        router.replace("/staff/admin");
      } else {
        const m = await api.motoboyLogin(phone, password);
        await storage.setItem("neia:motoboy", m as any);
        router.replace("/staff/motoboy");
      }
    } catch (e: any) { setError(e.message || "Erro no login"); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable testID="staff-login-back" onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft color={COLORS.onSurface} size={20} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{isAdmin ? "Área Admin" : "Área Motoboy"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.lockCircle}><Lock color={COLORS.brand} size={32} weight="fill" /></View>
        <Text style={styles.subtitle}>{isAdmin ? "Digite a senha de administrador" : "Entre com seu telefone e senha"}</Text>

        {!isAdmin && (
          <View style={styles.field}>
            <Text style={styles.label}>Telefone</Text>
            <TextInput
              testID="motoboy-phone-input"
              value={phone} onChangeText={setPhone} keyboardType="phone-pad"
              placeholder="11999990001" placeholderTextColor={COLORS.muted}
              style={styles.input}
            />
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.label}>Senha</Text>
          <TextInput
            testID={isAdmin ? "admin-password-input" : "motoboy-password-input"}
            value={password} onChangeText={setPassword} secureTextEntry
            placeholder={isAdmin ? "senha admin" : "1234"} placeholderTextColor={COLORS.muted}
            style={styles.input}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable testID="staff-login-submit" onPress={login} disabled={loading} style={[styles.cta, loading && { opacity: 0.6 }]}>
          <Text style={styles.ctaText}>{loading ? "Entrando…" : "Entrar"}</Text>
        </Pressable>

        {!isAdmin && (
          <Text style={styles.hint}>Motoboys demo: 11999990001 / 11999990002 (senha 1234)</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center", color: COLORS.onSurface },
  body: { padding: SPACING.xl, gap: SPACING.md, alignItems: "stretch" },
  lockCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.brandTertiary, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: SPACING.xl },
  subtitle: { fontSize: 14, color: COLORS.muted, textAlign: "center", marginBottom: SPACING.md },
  field: { gap: 4 },
  label: { fontSize: 11, fontWeight: "700", color: COLORS.muted },
  input: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, color: COLORS.onSurface },
  cta: { marginTop: SPACING.md, backgroundColor: COLORS.brand, paddingVertical: SPACING.md, borderRadius: RADIUS.pill, alignItems: "center" },
  ctaText: { color: COLORS.surface, fontWeight: "800", fontSize: 15 },
  error: { color: COLORS.error, fontSize: 13, fontWeight: "700", textAlign: "center" },
  hint: { fontSize: 11, color: COLORS.muted, textAlign: "center", marginTop: SPACING.md },
});
