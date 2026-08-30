import { Linking } from "react-native";
import type { Order } from "@/src/api";

const cleanPhone = (p: string) => p.replace(/\D/g, "");

export function orderStatusMessage(o: Order, appUrl: string): string {
  const url = `${appUrl}/order/${o.id}`;
  const isPickup = o.fulfillment_type === "pickup";
  const eta = o.eta_min;
  const etaLine = eta && (o.status === "recebido" || o.status === "fritando")
    ? `\n⏱️ Previsão de *${isPickup ? "retirada" : "entrega"}*: ~${eta} min`
    : "";
  const labelByStatus: Record<string, string> = {
    recebido: `🥟 Recebemos seu pedido! Já já ele entra no preparo.${etaLine}`,
    fritando: `🔥 Seu pedido está em preparo, quentinho e crocante!${etaLine}`,
    saiu_entrega: isPickup
      ? "🎉 Seu pedido está *PRONTO* para retirada! Passe no balcão."
      : `🛵 Seu pedido saiu para entrega${o.motoboy_name ? ` com ${o.motoboy_name}` : ""}. Acompanhe pelo link!`,
    entregue: "✅ Pedido entregue! Bom apetite e obrigado pela preferência 💛",
    cancelado: "❌ Infelizmente seu pedido foi cancelado. Fale com a gente para entender.",
  };
  return (
    `${labelByStatus[o.status] || "Novidade do seu pedido!"}\n\n` +
    `Pedido *#${o.short_code}* — Néia Salgados\n` +
    `Acompanhe: ${url}\n\n` +
    `— *Néia Salgados* — O sabor que faz a diferença 💛`
  );
}

export function openWhatsApp(phone: string, message: string) {
  const p = cleanPhone(phone);
  const url = `https://wa.me/${p.length === 11 ? "55" + p : p}?text=${encodeURIComponent(message)}`;
  Linking.openURL(url).catch(() => {});
}
