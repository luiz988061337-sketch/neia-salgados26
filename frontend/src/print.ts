import * as Print from "expo-print";
import { Platform } from "react-native";
import { api } from "@/src/api";

/** Formata o recibo como HTML monoespaçado com largura equivalente ao papel escolhido. */
function receiptHtml(text: string, widthMm: number): string {
  const fontSize = widthMm <= 58 ? 10 : 12;
  const paddingMm = 4;
  const safeText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${widthMm}mm;
    padding: ${paddingMm}mm;
    box-sizing: border-box;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontSize}pt;
    line-height: 1.35;
    color: #000;
  }
  pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
</style>
</head><body><pre>${safeText}</pre></body></html>`;
}

/** Busca a comanda renderizada no backend e abre o diálogo de impressão do sistema. */
export async function printOrderReceipt(orderId: string, printerId?: string) {
  const data = await api.adminOrderReceipt(orderId, printerId);
  const html = receiptHtml(data.text, data.width_mm || 80);
  if (Platform.OS === "web") {
    // Abre uma janela nova e chama print()
    const win = (globalThis as any).window?.open?.("", "_blank", "width=420,height=640");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { try { win.print(); } catch {} }, 400);
    }
    return data;
  }
  await Print.printAsync({ html });
  return data;
}
