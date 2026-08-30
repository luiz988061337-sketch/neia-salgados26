import { storage } from "@/src/utils/storage";
import { Platform } from "react-native";

const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const BACKEND_ORIGIN = process.env.EXPO_PUBLIC_BACKEND_URL || "";

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data?.detail || data?.message || `Erro ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export type Product = {
  id: string;
  name: string;
  description: string;
  category: "combo" | "frito" | "congelado" | "bebida";
  subcategory?: string | null;
  price: number;
  unit_size: number;
  image_url: string;
  image_urls?: string[];
  flavors: string[];
  is_featured: boolean;
  theme?: string | null;
  active?: boolean;
};

export type CartItem = {
  product_id: string;
  product_name: string;
  category: "combo" | "frito" | "congelado" | "bebida";
  quantity: number;
  unit_price: number;
  subtotal: number;
  flavors: Record<string, number>;
  image_url: string;
};

export type Neighborhood = { id: string; name: string; delivery_fee: number; active: boolean };
export type Theme = { id: string; name: string; label: string; emoji: string; banner_image?: string; active: boolean };
export type Settings = {
  store_name: string; store_address: string;
  store_lat: number; store_lng: number;
  base_delivery_fee: number; per_km_fee: number;
  min_delivery_fee: number; max_delivery_km: number;
  auto_whatsapp?: boolean; admin_phone?: string;
  open_days: number[]; open_time: string; close_time: string;
  birthday_coupon_pct: number;
  twilio_ready?: boolean;
};
export type StoreStatus = { is_open: boolean; open_days: number[]; open_time: string; close_time: string; bulk_tiers?: BulkTier[] };
export type BirthdayCustomer = { phone: string; name: string; birthday: string; whatsapp_opt_in?: boolean };
export type RankingItem = {
  motoboy_id: string; name: string; phone: string;
  deliveries: number; avg_minutes: number | null; revenue: number;
};

export type BulkTier = { min_qty: number; discount_pct: number; label: string };
export type CustomerVip = {
  phone: string; name: string; orders_count: number; total_spent: number;
  last_order_at?: string; birthday?: string | null;
};
export type ChatMessage = { id: string; order_id: string; from_role: "customer" | "motoboy"; text: string; created_at: string };
export type AppNotification = { id: string; phone: string; title: string; body: string; kind: string; order_id?: string | null; read: boolean; created_at: string };
export type Analytics = {
  period: string; total_revenue: number; orders_count: number;
  delivered_count: number; avg_ticket: number;
  top_products: { name: string; qty: number; revenue: number }[];
  series: { label: string; revenue: number; orders: number }[];
};

export type Order = {
  id: string;
  short_code: string;
  customer: { name: string; phone: string; address: string; complement?: string;
             neighborhood_id?: string; neighborhood_name?: string;
             delivery_lat?: number; delivery_lng?: number };
  items: CartItem[];
  subtotal: number;
  delivery_fee: number;
  distance_km?: number | null;
  discount: number;
  total: number;
  payment_method: "pix" | "dinheiro" | "cartao";
  change_for?: number | null;
  coupon_code?: string | null;
  scheduled_for?: string | null;
  status: "recebido" | "fritando" | "saiu_entrega" | "entregue" | "cancelado";
  motoboy_id?: string | null;
  motoboy_name?: string | null;
  notes?: string;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
  motoboy_location?: { lat: number; lng: number; last_ping: string; name: string; phone: string } | null;
};

export type Motoboy = { id: string; name: string; phone: string; photo_url?: string; current_lat?: number; current_lng?: number };

export function fileUrl(pathOrUrl: string) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  // Backend returns something like "/api/files/neia-salgados/uploads/..."
  return `${BACKEND_ORIGIN}${pathOrUrl}`;
}

export const api = {
  listProducts: (category?: string) => req<Product[]>(`/products${category ? `?category=${category}` : ""}`),
  getProduct: (id: string) => req<Product>(`/products/${id}`),
  listNeighborhoods: () => req<Neighborhood[]>("/neighborhoods"),
  listActiveThemes: () => req<Theme[]>("/themes/active"),
  createOrder: (body: any) => req<Order>("/orders", { method: "POST", body: JSON.stringify(body) }),
  getOrder: (id: string) => req<Order>(`/orders/${id}`),
  listOrdersByPhone: (phone: string) => req<Order[]>(`/orders?phone=${encodeURIComponent(phone)}`),
  validateCoupon: (code: string) => req<{ code: string; discount_percent: number }>(`/coupons/validate/${code}`),
  motoboyLogin: (phone: string, password: string) =>
    req<Motoboy>("/motoboy/login", { method: "POST", body: JSON.stringify({ phone, password }) }),
  motoboyOrders: (id: string) => req<Order[]>(`/motoboy/${id}/orders`),
  motoboyUpdateLocation: (id: string, lat: number, lng: number) =>
    req(`/motoboy/${id}/location`, { method: "POST", body: JSON.stringify({ lat, lng }) }),
  motoboyStartDelivery: (id: string, orderId: string) =>
    req(`/motoboy/${id}/start-delivery/${orderId}`, { method: "POST" }),
  motoboyComplete: (id: string, orderId: string) =>
    req(`/motoboy/${id}/complete/${orderId}`, { method: "POST" }),
  adminLogin: (password: string) =>
    req<{ ok: boolean }>("/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  adminOrders: (status?: string) => req<Order[]>(`/admin/orders${status ? `?status=${status}` : ""}`),
  adminUpdateStatus: (id: string, status: string) =>
    req(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  adminAssign: (id: string, motoboy_id: string) =>
    req(`/admin/orders/${id}/assign`, { method: "POST", body: JSON.stringify({ motoboy_id }) }),
  adminMotoboys: () => req<Motoboy[]>("/admin/motoboys"),
  adminProducts: () => req<Product[]>("/admin/products"),
  adminUpdateProduct: (id: string, body: Partial<Product>) =>
    req(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminCreateProduct: (body: Partial<Product>) =>
    req<Product>(`/admin/products`, { method: "POST", body: JSON.stringify(body) }),
  adminDeleteProduct: (id: string) =>
    req(`/admin/products/${id}`, { method: "DELETE" }),
  adminNeighborhoods: () => req<Neighborhood[]>("/admin/neighborhoods"),
  adminCreateNeighborhood: (body: { name: string; delivery_fee: number; active?: boolean }) =>
    req<Neighborhood>("/admin/neighborhoods", { method: "POST", body: JSON.stringify(body) }),
  adminUpdateNeighborhood: (id: string, body: any) =>
    req(`/admin/neighborhoods/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminDeleteNeighborhood: (id: string) =>
    req(`/admin/neighborhoods/${id}`, { method: "DELETE" }),
  adminThemes: () => req<Theme[]>("/admin/themes"),
  adminToggleTheme: (id: string, active: boolean) =>
    req(`/admin/themes/${id}/toggle`, { method: "PATCH", body: JSON.stringify({ active }) }),
  getSettings: () => req<Settings>("/settings"),
  adminGetSettings: () => req<Settings>("/admin/settings"),
  adminUpdateSettings: (body: Partial<Settings>) =>
    req<Settings>("/admin/settings", { method: "PATCH", body: JSON.stringify(body) }),
  adminMotoboysRanking: (date?: string) =>
    req<{ date: string; ranking: RankingItem[] }>(`/admin/motoboys/ranking${date ? `?date=${date}` : ""}`),
  storeStatus: () => req<StoreStatus>("/store-status"),
  adminBirthdaysToday: () => req<{ date: string; customers: BirthdayCustomer[] }>("/admin/birthdays/today"),
  adminSendBirthdays: () => req<{ date: string; sent: any[]; twilio_ready: boolean }>("/admin/birthdays/send", { method: "POST" }),
  adminCustomersRanking: () => req<{ ranking: CustomerVip[] }>("/admin/customers/ranking"),
  listMessages: (orderId: string, since?: string) =>
    req<ChatMessage[]>(`/orders/${orderId}/messages${since ? `?since=${encodeURIComponent(since)}` : ""}`),
  sendMessage: (orderId: string, from_role: "customer" | "motoboy", text: string) =>
    req<ChatMessage>(`/orders/${orderId}/messages`, {
      method: "POST",
      body: JSON.stringify({ order_id: orderId, from_role, text }),
    }),
  listNotifications: (phone: string) => req<{ unread: number; items: AppNotification[] }>(`/notifications?phone=${encodeURIComponent(phone)}`),
  markAllRead: (phone: string) => req(`/notifications/read-all?phone=${encodeURIComponent(phone)}`, { method: "POST" }),
  adminAnalytics: (period: "today" | "week" | "month") => req<Analytics>(`/admin/analytics?period=${period}`),
  getMe: (phone: string) => req<any>(`/customers/me?phone=${encodeURIComponent(phone)}`),
  rateOrder: (id: string, stars: number, comment: string) =>
    req(`/orders/${id}/rating`, { method: "POST", body: JSON.stringify({ stars, comment }) }),
  redeemPoints: (phone: string, points: number) =>
    req<{ code: string; discount_percent: number; remaining_points: number }>(
      `/customers/${encodeURIComponent(phone)}/redeem-points`,
      { method: "POST", body: JSON.stringify({ points }) }
    ),
  adminCoupons: () => req<any[]>("/admin/coupons"),
  adminCreateCoupon: (body: any) =>
    req<any>("/admin/coupons", { method: "POST", body: JSON.stringify(body) }),
  adminUpdateCoupon: (code: string, body: any) =>
    req(`/admin/coupons/${code}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminDeleteCoupon: (code: string) =>
    req(`/admin/coupons/${code}`, { method: "DELETE" }),
  async adminUploadImage(uri: string, name: string, type: string): Promise<{ path: string; url: string }> {
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("file", blob, name);
    } else {
      form.append("file", { uri, name, type } as any);
    }
    const res = await fetch(`${API}/admin/upload`, { method: "POST", body: form as any });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) throw new Error(data?.detail || `Erro ${res.status}`);
    return data;
  },
};

// -- Cart persistence
const CART_KEY = "neia:cart";
const CUSTOMER_KEY = "neia:customer";

export async function getCart(): Promise<CartItem[]> {
  return (await storage.getItem(CART_KEY, [] as any)) as CartItem[];
}
export async function saveCart(items: CartItem[]) {
  return storage.setItem(CART_KEY, items as any);
}
export async function clearCart() { return storage.removeItem(CART_KEY); }
export async function getCustomer(): Promise<any> { return storage.getItem(CUSTOMER_KEY, null as any); }
export async function saveCustomer(c: any) { return storage.setItem(CUSTOMER_KEY, c); }
