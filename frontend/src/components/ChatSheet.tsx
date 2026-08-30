import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PaperPlaneRight, X } from "phosphor-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ChatMessage } from "@/src/api";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Props = {
  orderId: string;
  role: "customer" | "motoboy";
  onClose: () => void;
  title: string;
  subtitle?: string;
};

export default function ChatSheet({ orderId, role, onClose, title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const poll = useRef<any>(null);

  const load = async () => {
    try { setMessages(await api.listMessages(orderId)); } catch {}
  };

  useEffect(() => {
    load();
    poll.current = setInterval(load, 3500);
    return () => clearInterval(poll.current);
  }, [orderId]);

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(orderId, role, t);
      setMessages((m) => [...m, msg]);
      setText("");
    } catch {} finally { setSending(false); }
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <Pressable testID="chat-close" onPress={onClose} style={styles.closeBtn}>
            <X color={COLORS.onSurface} size={22} />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nenhuma mensagem ainda. Diga oi!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.from_role === role;
            return (
              <View testID={`msg-${item.id}`} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.msgText, mine && { color: COLORS.surface }]}>{item.text}</Text>
                <Text style={[styles.msgTime, mine && { color: "rgba(252,251,248,0.7)" }]}>
                  {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            );
          }}
        />

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.inputRow}>
            <TextInput
              testID="chat-input"
              value={text} onChangeText={setText}
              placeholder="Escreva uma mensagem…"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              multiline
              onSubmitEditing={send}
            />
            <Pressable testID="chat-send" onPress={send} disabled={!text.trim() || sending} style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}>
              <PaperPlaneRight color={COLORS.surface} size={18} weight="fill" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", inset: 0 as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLORS.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, maxHeight: "82%", minHeight: "60%" },
  head: { flexDirection: "row", alignItems: "center", padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: SPACING.xxl },
  emptyText: { color: COLORS.muted, fontSize: 13 },
  bubble: { maxWidth: "82%", paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.md, gap: 2 },
  mine: { alignSelf: "flex-end", backgroundColor: COLORS.brand, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: COLORS.surfaceSecondary, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, color: COLORS.onSurface, lineHeight: 19 },
  msgTime: { fontSize: 10, color: COLORS.muted, alignSelf: "flex-end", marginTop: 2 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm, padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  input: { flex: 1, minHeight: 44, maxHeight: 100, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, fontSize: 14, color: COLORS.onSurface },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand, alignItems: "center", justifyContent: "center" },
});
