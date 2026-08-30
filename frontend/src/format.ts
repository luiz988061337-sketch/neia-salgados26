import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    recebido: "Recebido",
    fritando: "Fritando",
    saiu_entrega: "Saiu para entrega",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };
  return map[s] || s;
};

export const timeAgo = (iso: string) => {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }); } catch { return ""; }
};

export const categoryLabel = (c: string) => {
  const m: Record<string, string> = { combo: "Combos", frito: "Salgados Fritos", congelado: "Congelados" };
  return m[c] || c;
};
