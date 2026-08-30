import { Linking } from "react-native";
import type { Order } from "@/src/api";

const cleanPhone = (p: string) => p.replace(/\D/g, "");

export function orderStatusMessage(o: Order, appUrl: string): string {
  const url = `${appUrl}/order/${o.id}`;
  const labelByStatus: Record<string, string> = {
    recebido: "🥟 Recebemos o seu pedido! Já já ele entra na fritadeira.",
    fritando: "🔥 Seu pedido já está fritando, quentinho e crocante!",
    saiu_entrega: `🛵 Seu pedido saiu para entrega${o.motoboy_name ? ` com ${o.motoboy_name}` : ""}. Acompanhe pelo link!`,
    entregue: "✅ Pedido entregue! Bom apetite e obrigado pela preferência 💛",
    cancelado: "❌ Infelizmente seu pedido foi cancelado. Fale com a gente para entender.",
  };
  return (
    `${labelByStatus[o.status] || "Novidade do seu pedido!"}\n\n` +
    `Pedido *#${o.short_code}* — Néia Salgados\n` +
    `Acompanhe: ${url}`
  );
}

export function openWhatsApp(phone: string, message: string) {
  const p = cleanPhone(phone);
  const url = `https://wa.me/${p.length === 11 ? "55" + p : p}?text=${encodeURIComponent(message)}`;
  Linking.openURL(url).catch(() => {});
}
