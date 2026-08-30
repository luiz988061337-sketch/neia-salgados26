from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from starlette.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import math
import logging
import requests
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD') or ""
if not ADMIN_PASSWORD:
    import warnings as _w
    _w.warn("ADMIN_PASSWORD not set in environment — admin login will be unavailable. Set it in backend/.env or platform secrets.")
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "neia-salgados"
_storage_key: Optional[str] = None

# Twilio (opcional)
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_API_KEY_SID = os.environ.get("TWILIO_API_KEY_SID", "")
TWILIO_API_KEY_SECRET = os.environ.get("TWILIO_API_KEY_SECRET", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
TWILIO_ORDER_TEMPLATE_SID = os.environ.get("TWILIO_ORDER_TEMPLATE_SID", "")
TWILIO_BIRTHDAY_TEMPLATE_SID = os.environ.get("TWILIO_BIRTHDAY_TEMPLATE_SID", "")

_twilio_client = None
def twilio_ready() -> bool:
    return bool((TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET and TWILIO_ACCOUNT_SID) or (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN))


def twilio_client():
    global _twilio_client
    if _twilio_client:
        return _twilio_client
    if not twilio_ready():
        return None
    from twilio.rest import Client
    if TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET:
        _twilio_client = Client(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, account_sid=TWILIO_ACCOUNT_SID)
    else:
        _twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    return _twilio_client


def _phone_to_whatsapp(phone: str) -> str:
    import re
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("0"):
        digits = digits[1:]
    if not digits.startswith("55"):
        digits = "55" + digits
    return f"whatsapp:+{digits}"


def send_whatsapp(phone: str, body: Optional[str] = None, template_sid: Optional[str] = None, variables: Optional[dict] = None, media_url: Optional[str] = None) -> dict:
    client = twilio_client()
    if not client:
        return {"sent": False, "reason": "twilio_not_configured"}
    try:
        to = _phone_to_whatsapp(phone)
        kwargs: dict = {"from_": TWILIO_WHATSAPP_FROM, "to": to}
        if template_sid:
            import json as _j
            kwargs["content_sid"] = template_sid
            kwargs["content_variables"] = _j.dumps(variables or {}, ensure_ascii=False)
        else:
            kwargs["body"] = body or ""
            if media_url:
                # Twilio aceita até 5 URLs de media
                kwargs["media_url"] = [media_url]
        msg = client.messages.create(**kwargs)
        return {"sent": True, "sid": msg.sid, "status": msg.status}
    except Exception as e:
        return {"sent": False, "reason": str(e)}


APP_PUBLIC_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


def _tracking_link(order_id: str) -> str:
    base = APP_PUBLIC_URL or ""
    return f"{base}/order/{order_id}" if base else f"/order/{order_id}"


async def _brand_media_url() -> Optional[str]:
    """Retorna URL pública absoluta da logo (para Twilio media). None se não configurada."""
    s = await get_settings()
    logo = (s.get("logo_url") or "").strip()
    if not logo or not APP_PUBLIC_URL:
        return None
    return f"{APP_PUBLIC_URL}{logo}" if logo.startswith("/") else logo


async def notify_customer_out_for_delivery(order: dict):
    """Envia mensagem ao cliente com link de acompanhamento quando o pedido sai para entrega."""
    if not order:
        return {"sent": False, "reason": "no_order"}
    if not order.get("customer", {}).get("whatsapp_opt_in", True):
        return {"sent": False, "reason": "opt_out"}
    if not twilio_ready():
        return {"sent": False, "reason": "twilio_not_configured"}
    name = order["customer"].get("name", "")
    phone = order["customer"].get("phone", "")
    link = _tracking_link(order["id"])
    moto = order.get("motoboy_name") or "seu entregador"
    msg = (
        f"🛵 Olá {name}! Seu pedido *#{order['short_code']}* saiu para entrega com {moto}.\n"
        f"Acompanhe em tempo real: {link}\n\n"
        f"— *Néia Salgados* — O sabor que faz a diferença 💛"
    )
    media = await _brand_media_url()
    return send_whatsapp(phone, body=msg, media_url=media)

app = FastAPI()


@app.get("/health")
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")


@api_router.get("/health")
async def api_health():
    return {"status": "ok"}


# ============ MODELS ============
ProductCategory = Literal["combo", "frito", "congelado", "bebida"]
OrderStatus = Literal["recebido", "fritando", "saiu_entrega", "entregue", "cancelado"]
PaymentMethod = Literal["pix", "dinheiro", "cartao"]


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    category: ProductCategory
    subcategory: Optional[str] = None
    price: float
    unit_size: int
    image_url: str
    image_urls: List[str] = []
    flavors: List[str] = []
    is_featured: bool = False
    theme: Optional[str] = None
    active: bool = True


class OrderItem(BaseModel):
    product_id: str
    product_name: str
    category: ProductCategory
    quantity: int
    unit_price: float
    subtotal: float
    flavors: dict = {}


class Customer(BaseModel):
    name: str
    phone: str
    address: str
    complement: Optional[str] = ""
    neighborhood_id: Optional[str] = None  # deprecated
    neighborhood_name: Optional[str] = None
    delivery_lat: Optional[float] = None
    delivery_lng: Optional[float] = None
    birthday: Optional[str] = None  # "MM-DD" or "YYYY-MM-DD"
    whatsapp_opt_in: Optional[bool] = True


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    short_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:6].upper())
    customer: Customer
    items: List[OrderItem]
    subtotal: float
    delivery_fee: float = 0.0
    distance_km: Optional[float] = None
    discount: float = 0.0
    total: float
    payment_method: PaymentMethod
    change_for: Optional[float] = None
    coupon_code: Optional[str] = None
    referral_code_used: Optional[str] = None
    scheduled_for: Optional[str] = None
    fulfillment_type: Optional[str] = "delivery"  # "delivery" ou "pickup"
    eta_min: Optional[int] = None                 # tempo estimado em minutos (calc no create)
    status: OrderStatus = "recebido"
    motoboy_id: Optional[str] = None
    motoboy_name: Optional[str] = None
    notes: Optional[str] = ""
    delivered_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Motoboy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    password: str
    photo_url: str = ""
    active: bool = True
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    last_ping: Optional[str] = None


class Neighborhood(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    delivery_fee: float
    active: bool = True


class Theme(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str            # e.g. "copa", "festa-junina"
    label: str           # display name
    emoji: str = "🎉"
    banner_image: Optional[str] = None
    active: bool = False


# ============ REQUEST MODELS ============
class OrderCreate(BaseModel):
    customer: Customer
    items: List[OrderItem]
    payment_method: PaymentMethod
    change_for: Optional[float] = None
    coupon_code: Optional[str] = None
    referral_code_used: Optional[str] = None
    notes: Optional[str] = ""
    scheduled_for: Optional[str] = None
    fulfillment_type: Optional[str] = "delivery"  # "delivery" ou "pickup"


class SettingsIn(BaseModel):
    store_name: Optional[str] = None
    store_lat: Optional[float] = None
    store_lng: Optional[float] = None
    store_address: Optional[str] = None
    base_delivery_fee: Optional[float] = None
    per_km_fee: Optional[float] = None
    min_delivery_fee: Optional[float] = None
    max_delivery_km: Optional[float] = None
    auto_whatsapp: Optional[bool] = None
    admin_phone: Optional[str] = None
    open_days: Optional[List[int]] = None
    open_time: Optional[str] = None
    close_time: Optional[str] = None
    birthday_coupon_pct: Optional[int] = None
    bulk_tiers: Optional[List[dict]] = None
    loyalty_active: Optional[bool] = None
    loyalty_points_per_real: Optional[float] = None
    loyalty_tiers: Optional[List[dict]] = None
    logo_url: Optional[str] = None
    pickup_eta_min: Optional[int] = None    # tempo estimado de retirada (min)
    delivery_eta_min: Optional[int] = None  # tempo estimado de entrega (min)


class ChatMessageIn(BaseModel):
    order_id: str
    from_role: Literal["customer", "motoboy"]
    text: str


class RatingIn(BaseModel):
    stars: int
    comment: Optional[str] = ""


class MotoboyLogin(BaseModel):
    phone: str
    password: str


class AdminLogin(BaseModel):
    password: str


class LocationUpdate(BaseModel):
    lat: float
    lng: float


class StatusUpdate(BaseModel):
    status: OrderStatus


class AssignMotoboy(BaseModel):
    motoboy_id: str


class NeighborhoodIn(BaseModel):
    name: str
    delivery_fee: float
    active: bool = True


class ThemeIn(BaseModel):
    name: str
    label: str
    emoji: str = "🎉"
    banner_image: Optional[str] = None
    active: bool = False


class ThemeToggle(BaseModel):
    active: bool


class ProductPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    flavors: Optional[List[str]] = None
    is_featured: Optional[bool] = None
    theme: Optional[str] = None
    active: Optional[bool] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    unit_size: Optional[int] = None


class ProductCreate(BaseModel):
    name: str
    description: str = ""
    category: str
    subcategory: Optional[str] = None
    price: float
    unit_size: int = 1
    image_url: str = ""
    flavors: List[str] = []


class CouponIn(BaseModel):
    code: str
    discount_percent: int
    active: bool = True
    expires_at: Optional[str] = None       # ISO date string
    max_uses: Optional[int] = None         # None = ilimitado
    first_order_only: Optional[bool] = False
    description: Optional[str] = ""


class CouponPatch(BaseModel):
    discount_percent: Optional[int] = None
    active: Optional[bool] = None
    expires_at: Optional[str] = None
    max_uses: Optional[int] = None
    first_order_only: Optional[bool] = None
    description: Optional[str] = None


class RedeemPointsIn(BaseModel):
    points: int


class PrintTemplateIn(BaseModel):
    name: str
    width_mm: int = 80  # 58 ou 80
    header: str = ""
    body_template: str = ""
    footer: str = ""
    active: bool = True


class PrintTemplatePatch(BaseModel):
    name: Optional[str] = None
    width_mm: Optional[int] = None
    header: Optional[str] = None
    body_template: Optional[str] = None
    footer: Optional[str] = None
    active: Optional[bool] = None


class PrinterIn(BaseModel):
    name: str
    model: str = ""
    template_id: Optional[str] = None
    width_mm: int = 80
    is_default: bool = False
    active: bool = True


class PrinterPatch(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    template_id: Optional[str] = None
    width_mm: Optional[int] = None
    is_default: Optional[bool] = None
    active: Optional[bool] = None


class MotoboyIn(BaseModel):
    name: str
    phone: str
    password: str
    photo_url: Optional[str] = ""
    active: bool = True
    commission_pct: Optional[float] = 0.0


class MotoboyPatch(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    photo_url: Optional[str] = None
    active: Optional[bool] = None
    commission_pct: Optional[float] = None


# ============ STORAGE HELPERS ============
def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def get_settings() -> dict:
    doc = await db.settings.find_one({"id": "singleton"}, {"_id": 0})
    if doc:
        return doc
    default = {
        "id": "singleton",
        "store_name": "Néia Salgados",
        "store_address": "Av. Paulista, 1000 — São Paulo/SP",
        "store_lat": -23.5613,
        "store_lng": -46.6558,
        "base_delivery_fee": 6.0,
        "per_km_fee": 2.0,
        "min_delivery_fee": 6.0,
        "max_delivery_km": 15.0,
        "auto_whatsapp": True,
        "admin_phone": "",
        "open_days": [1, 2, 3, 4, 5, 6],
        "open_time": "10:00",
        "close_time": "20:00",
        "birthday_coupon_pct": 20,
        "bulk_tiers": [
            {"min_qty": 100, "discount_pct": 5, "label": "Encomenda"},
            {"min_qty": 200, "discount_pct": 8, "label": "Encomenda Grande"},
            {"min_qty": 500, "discount_pct": 12, "label": "Encomenda em Massa"},
            {"min_qty": 1000, "discount_pct": 18, "label": "Encomenda Master"},
        ],
        "loyalty_active": True,
        "loyalty_points_per_real": 1.0,
        "loyalty_tiers": [
            {"points": 100, "discount_pct": 5},
            {"points": 200, "discount_pct": 10},
            {"points": 300, "discount_pct": 15},
            {"points": 500, "discount_pct": 25},
        ],
        "pickup_eta_min": 30,
        "delivery_eta_min": 45,
    }
    await db.settings.insert_one(default)
    return default


def _parse_hm(s: str) -> tuple[int, int]:
    hh, mm = s.split(":")
    return int(hh), int(mm)


def is_store_open(settings: dict, at: Optional[datetime] = None) -> bool:
    at = at or datetime.now(timezone.utc) - timedelta(hours=3)  # America/Sao_Paulo aprox
    weekday = (at.weekday() + 1) % 7  # Mon=0 → 1, Sun=6 → 0 (align 0=Sun..6=Sat)
    open_days = settings.get("open_days") or [1, 2, 3, 4, 5, 6]
    if weekday not in open_days:
        return False
    try:
        oh, om = _parse_hm(settings.get("open_time", "10:00"))
        ch, cm = _parse_hm(settings.get("close_time", "20:00"))
    except Exception:
        return True
    minutes = at.hour * 60 + at.minute
    return oh * 60 + om <= minutes < ch * 60 + cm


def compute_delivery(distance_km: Optional[float], settings: dict) -> float:
    if distance_km is None:
        return float(settings.get("min_delivery_fee", 6.0))
    base = float(settings.get("base_delivery_fee", 6.0))
    per_km = float(settings.get("per_km_fee", 2.0))
    min_fee = float(settings.get("min_delivery_fee", 6.0))
    extra = max(0.0, distance_km - 3.0)  # base cobre até 3 km
    fee = base + extra * per_km
    return round(max(fee, min_fee), 2)


def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY não configurado")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = _init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str) -> tuple[bytes, str]:
    global _storage_key
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ============ SEED ============
async def seed_data():
    if await db.products.count_documents({}) == 0:
        seed_products = [
            {
                "id": str(uuid.uuid4()), "name": "Combo Festa 50", "description": "50 salgados fritos sortidos (coxinha, kibe, risole, bolinha de queijo). Ideal para pequenas reuniões.",
                "category": "combo", "price": 79.90, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1641848462741-982725a92e49?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHw0fHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": ["Coxinha", "Kibe", "Risole", "Bolinha de Queijo", "Enroladinho"],
                "is_featured": True, "theme": None, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Combo Aniversário 100", "description": "100 salgados fritos sortidos + 20 mini docinhos brasileiros.",
                "category": "combo", "price": 159.90, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1598142982901-df6cec10ae35?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": ["Coxinha", "Kibe", "Risole", "Bolinha de Queijo", "Enroladinho", "Croquete"],
                "is_featured": True, "theme": None, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Coxinha de Frango", "description": "Coxinha tradicional recheada com frango desfiado. Vendida em lotes de 50 unidades.",
                "category": "frito", "price": 1.60, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1623653387945-2fd25214f8fc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwyfHxhcHBldGl6aW5nJTIwZnJpZWQlMjBzbmFja3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": [], "is_featured": False, "theme": None, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Kibe Recheado", "description": "Kibe crocante recheado com catupiry. Lotes de 50 unidades.",
                "category": "frito", "price": 1.80, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1641848462741-982725a92e49?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHw0fHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": [], "is_featured": False, "theme": None, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Coxinha Congelada", "description": "Coxinha crua congelada. Pronta para fritar em casa. Venda por unidade.",
                "category": "congelado", "price": 1.20, "unit_size": 1,
                "image_url": "https://images.unsplash.com/photo-1598142982901-df6cec10ae35?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": [], "is_featured": False, "theme": None, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Kit Congelado 30un", "description": "Kit com 30 salgados congelados sortidos. Venda a partir de 1 kit.",
                "category": "congelado", "price": 34.90, "unit_size": 1,
                "image_url": "https://images.unsplash.com/photo-1623653387945-2fd25214f8fc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwyfHxhcHBldGl6aW5nJTIwZnJpZWQlMjBzbmFja3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": [], "is_featured": True, "theme": None, "active": True,
            },
            # Combo temático da Copa
            {
                "id": str(uuid.uuid4()), "name": "Combo Copa Verde e Amarelo", "description": "50 salgados especiais para você torcer pelo Brasil! Coxinha e kibe verdinho-amarelo temperados.",
                "category": "combo", "price": 89.90, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1598142982901-df6cec10ae35?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": ["Coxinha", "Kibe", "Bolinha de Queijo"], "is_featured": False, "theme": "copa", "active": True,
            },
            # Combo Festa Junina
            {
                "id": str(uuid.uuid4()), "name": "Combo Arraiá 60", "description": "60 salgados com sabor de festa junina: pastelzinho de milho, coxinha de frango e enroladinho de linguiça.",
                "category": "combo", "price": 99.90, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1623653387945-2fd25214f8fc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwyfHxhcHBldGl6aW5nJTIwZnJpZWQlMjBzbmFja3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": ["Pastel de Milho", "Coxinha", "Enroladinho"], "is_featured": False, "theme": "festa-junina", "active": True,
            },
        ]
        await db.products.insert_many(seed_products)

    if await db.products.count_documents({"subcategory": {"$exists": True, "$ne": None}}) == 0:
        mini_seeds = [
            ("Mini Fritos", "Sortido especial com coxinha, kibe, risole e bolinha de queijo. Todos mini!", "mini-fritos", 1.70),
            ("Mini Assados", "Enroladinho de salsicha, pão de queijo, esfihinha. Assados na hora.", "mini-assados", 1.90),
            ("Mini Pastelzinho", "Pastelzinho crocante recheado com carne, queijo ou palmito.", "mini-pastelzinho", 1.80),
            ("Mini Pizza", "Mini pizzas de mussarela, calabresa e portuguesa.", "mini-pizza", 2.20),
            ("Mini Empada", "Empadinha de frango com catupiry, queijo e camarão.", "mini-empada", 2.40),
        ]
        imgs = [
            "https://images.unsplash.com/photo-1641848462741-982725a92e49?w=600&q=80",
            "https://images.unsplash.com/photo-1598142982901-df6cec10ae35?w=600&q=80",
            "https://images.unsplash.com/photo-1623653387945-2fd25214f8fc?w=600&q=80",
        ]
        docs = []
        for idx, (name, desc, sub, price) in enumerate(mini_seeds):
            docs.append({
                "id": str(uuid.uuid4()), "name": name, "description": desc,
                "category": "frito", "subcategory": sub, "price": price, "unit_size": 50,
                "image_url": imgs[idx % len(imgs)], "image_urls": [],
                "flavors": [], "is_featured": False, "theme": None, "active": True,
            })
        await db.products.insert_many(docs)

    if await db.products.count_documents({"category": "bebida"}) == 0:
        beb_img = "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&q=80"
        bebidas = [
            ("Coca-Cola 2L", "Refrigerante Coca-Cola garrafa 2 litros gelado.", 12.90),
            ("Guaraná Antarctica 2L", "Guaraná Antarctica garrafa 2 litros gelado.", 11.90),
            ("Coca-Cola Lata 350ml", "Coca-Cola lata gelada 350ml.", 5.50),
            ("Suco de Laranja 1L", "Suco de laranja natural 1 litro.", 14.90),
            ("Água Mineral 500ml", "Água mineral sem gás 500ml.", 3.50),
        ]
        docs = []
        for (name, desc, price) in bebidas:
            docs.append({
                "id": str(uuid.uuid4()), "name": name, "description": desc,
                "category": "bebida", "subcategory": None, "price": price, "unit_size": 1,
                "image_url": beb_img, "image_urls": [],
                "flavors": [], "is_featured": False, "theme": None, "active": True,
            })
        await db.products.insert_many(docs)

    # Motoboys: NÃO criar seed em produção. O admin cria pelo painel `/staff/motoboys-admin`.
    # (Em ambiente de dev/preview, se desejar seed pontual, execute manualmente pelo endpoint POST /api/admin/motoboys)

    if await db.coupons.count_documents({}) == 0:
        await db.coupons.insert_many([
            {"code": "NEIA10", "discount_percent": 10, "active": True, "uses_count": 0, "max_uses": None,
             "first_order_only": False, "description": "10% off geral"},
            {"code": "PRIMEIRO", "discount_percent": 15, "active": True, "uses_count": 0, "max_uses": None,
             "first_order_only": True, "description": "15% off na primeira compra"},
            {"code": "BEMVINDO", "discount_percent": 15, "active": True, "uses_count": 0, "max_uses": None,
             "first_order_only": True, "description": "Aplicado automático na 1ª compra"},
        ])

    if await db.neighborhoods.count_documents({}) == 0:
        await db.neighborhoods.insert_many([
            {"id": str(uuid.uuid4()), "name": "Centro", "delivery_fee": 6.0, "active": True},
            {"id": str(uuid.uuid4()), "name": "Jardim das Flores", "delivery_fee": 8.0, "active": True},
            {"id": str(uuid.uuid4()), "name": "Vila Nova", "delivery_fee": 10.0, "active": True},
            {"id": str(uuid.uuid4()), "name": "Bairro Alto", "delivery_fee": 12.0, "active": True},
        ])

    if await db.themes.count_documents({}) == 0:
        await db.themes.insert_many([
            {"id": str(uuid.uuid4()), "name": "copa", "label": "Copa do Mundo", "emoji": "⚽",
             "banner_image": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80", "active": False},
            {"id": str(uuid.uuid4()), "name": "festa-junina", "label": "Festa Junina", "emoji": "🌽",
             "banner_image": "https://images.unsplash.com/photo-1560717845-968823efbee1?w=800&q=80", "active": False},
        ])

    if await db.print_templates.count_documents({}) == 0:
        default_body = (
            "PEDIDO #{short_code}\n"
            "{created_at}\n"
            "--------------------------------\n"
            "Cliente: {customer_name}\n"
            "Tel: {customer_phone}\n"
            "End: {customer_address}\n"
            "--------------------------------\n"
            "{items}\n"
            "--------------------------------\n"
            "Subtotal:  R$ {subtotal}\n"
            "Entrega:   R$ {delivery_fee}\n"
            "Desconto:  R$ {discount}\n"
            "TOTAL:     R$ {total}\n"
            "Pagto: {payment_method}\n"
        )
        await db.print_templates.insert_many([
            {"id": str(uuid.uuid4()), "name": "80mm — Padrão", "width_mm": 80,
             "header": "*** NÉIA SALGADOS ***\nO sabor que faz a diferença\n",
             "body_template": default_body,
             "footer": "\nObrigado pela preferencia!\n💛 Volte sempre 💛\n",
             "active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "58mm — Compacto", "width_mm": 58,
             "header": "NEIA SALGADOS\n",
             "body_template": default_body,
             "footer": "\nObrigado!\n",
             "active": True, "created_at": datetime.now(timezone.utc).isoformat()},
        ])

    if await db.printers.count_documents({}) == 0:
        t80 = await db.print_templates.find_one({"width_mm": 80}, {"_id": 0})
        await db.printers.insert_one({
            "id": str(uuid.uuid4()), "name": "Impressora Balcão", "model": "Bematech MP-4200",
            "template_id": t80["id"] if t80 else None, "width_mm": 80,
            "is_default": True, "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


# ============ ROUTES ============
@api_router.get("/")
async def root():
    return {"message": "Néia Salgados API"}


# --- Products
@api_router.get("/products")
async def list_products(category: Optional[str] = None, subcategory: Optional[str] = None):
    active_themes = [t["name"] async for t in db.themes.find({"active": True}, {"_id": 0, "name": 1})]
    q = {
        "active": True,
        "$or": [{"theme": None}, {"theme": {"$in": active_themes}}],
    }
    if category:
        q["category"] = category
    if subcategory:
        q["subcategory"] = subcategory
    docs = await db.products.find(q, {"_id": 0}).to_list(200)
    return docs


@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Produto não encontrado")
    return doc


# --- Neighborhoods
@api_router.get("/neighborhoods")
async def list_neighborhoods():
    docs = await db.neighborhoods.find({"active": True}, {"_id": 0}).sort("delivery_fee", 1).to_list(200)
    return docs


# --- Store status
@api_router.get("/store-status")
async def store_status():
    s = await get_settings()
    now = datetime.now(timezone.utc) - timedelta(hours=3)
    return {
        "is_open": is_store_open(s, now),
        "open_days": s.get("open_days", [1, 2, 3, 4, 5, 6]),
        "open_time": s.get("open_time", "10:00"),
        "close_time": s.get("close_time", "20:00"),
        "bulk_tiers": s.get("bulk_tiers", []),
    }


# --- Notifications (in-app bell)
async def create_notification(phone: str, title: str, body: str, kind: str = "status", order_id: Optional[str] = None):
    doc = {
        "id": str(uuid.uuid4()), "phone": phone, "title": title, "body": body,
        "kind": kind, "order_id": order_id, "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/notifications")
async def list_notifications(phone: str):
    docs = await db.notifications.find({"phone": phone}, {"_id": 0}).sort("created_at", -1).to_list(100)
    unread = sum(1 for d in docs if not d.get("read"))
    return {"unread": unread, "items": docs}


@api_router.post("/notifications/read-all")
async def read_all_notifications(phone: str):
    r = await db.notifications.update_many({"phone": phone, "read": False}, {"$set": {"read": True}})
    return {"updated": r.modified_count}


# --- Analytics
@api_router.get("/admin/analytics")
async def admin_analytics(period: str = "today"):
    now = datetime.now(timezone.utc) - timedelta(hours=3)
    if period == "today":
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        days = 1
    elif period == "week":
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=6)
        days = 7
    else:  # month
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=29)
        days = 30
    q = {"created_at": {"$gte": start.isoformat()}, "status": {"$ne": "cancelado"}}
    orders = await db.orders.find(q, {"_id": 0}).to_list(2000)

    total_revenue = round(sum(o.get("total", 0) for o in orders), 2)
    total_delivered = sum(1 for o in orders if o.get("status") == "entregue")
    orders_count = len(orders)
    avg_ticket = round(total_revenue / orders_count, 2) if orders_count else 0

    # Top products by quantity
    tally: dict = {}
    for o in orders:
        for it in o.get("items", []):
            key = it["product_name"]
            e = tally.setdefault(key, {"name": key, "qty": 0, "revenue": 0.0})
            e["qty"] += int(it.get("quantity", 0))
            e["revenue"] += float(it.get("subtotal", 0))
    top_products = sorted(tally.values(), key=lambda x: -x["revenue"])[:5]
    for p in top_products:
        p["revenue"] = round(p["revenue"], 2)

    # Daily series
    series = []
    for i in range(days):
        day = start + timedelta(days=i)
        next_day = day + timedelta(days=1)
        rev = 0.0
        cnt = 0
        for o in orders:
            try:
                created = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00"))
            except Exception:
                continue
            if day <= created < next_day:
                rev += float(o.get("total", 0))
                cnt += 1
        series.append({"label": day.strftime("%d/%m"), "revenue": round(rev, 2), "orders": cnt})

    return {
        "period": period,
        "total_revenue": total_revenue,
        "orders_count": orders_count,
        "delivered_count": total_delivered,
        "avg_ticket": avg_ticket,
        "top_products": top_products,
        "series": series,
    }


@api_router.get("/customers/me")
async def customer_me(phone: str):
    c = await db.customers.find_one({"phone": phone}, {"_id": 0})
    if not c:
        return {"phone": phone, "referral_code": None, "referrals_used": 0, "credits": [], "points": 0}
    code = c.get("referral_code")
    referrals_used = await db.orders.count_documents({"referral_code_used": code}) if code else 0
    credits = await db.coupons.find(
        {"belongs_to": phone, "active": True}, {"_id": 0}
    ).to_list(50)
    return {**c, "referrals_used": referrals_used, "credits": credits, "points": int(c.get("points", 0) or 0)}


@api_router.post("/customers/{phone}/redeem-points")
async def redeem_points(phone: str, body: RedeemPointsIn):
    s = await get_settings()
    if not bool(s.get("loyalty_active", True)):
        raise HTTPException(400, "Programa de fidelidade desativado")
    tiers = s.get("loyalty_tiers") or [
        {"points": 100, "discount_pct": 5},
        {"points": 200, "discount_pct": 10},
        {"points": 300, "discount_pct": 15},
        {"points": 500, "discount_pct": 25},
    ]
    valid_points = [int(t["points"]) for t in tiers]
    if body.points <= 0 or body.points not in valid_points:
        raise HTTPException(400, f"Resgate deve ser em {sorted(valid_points)} pontos")
    c = await db.customers.find_one({"phone": phone}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Cliente não encontrado")
    current = int(c.get("points", 0) or 0)
    if current < body.points:
        raise HTTPException(400, f"Você tem apenas {current} pontos")
    tier = next((t for t in tiers if int(t["points"]) == body.points), None)
    pct = int(tier["discount_pct"]) if tier else 5
    code = f"FID{phone[-4:]}-{int(datetime.now(timezone.utc).timestamp())}"
    await db.coupons.insert_one({
        "code": code, "discount_percent": pct, "active": True,
        "belongs_to": phone, "reason": "loyalty",
        "max_uses": 1, "uses_count": 0,
        "description": f"Cupom fidelidade — {body.points} pts → {pct}% off",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.customers.update_one({"phone": phone}, {"$inc": {"points": -body.points}})
    return {"code": code, "discount_percent": pct, "remaining_points": current - body.points}


@api_router.post("/orders/{order_id}/rating")
async def rate_order(order_id: str, body: RatingIn):
    stars = max(1, min(5, int(body.stars)))
    r = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"rating_stars": stars, "rating_comment": (body.comment or "")[:500],
                  "rated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Pedido não encontrado")
    return {"ok": True}


# --- Chat between customer and motoboy per order
@api_router.get("/orders/{order_id}/messages")
async def list_messages(order_id: str, since: Optional[str] = None):
    q: dict = {"order_id": order_id}
    if since:
        q["created_at"] = {"$gt": since}
    docs = await db.chat_messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    return docs


@api_router.post("/orders/{order_id}/messages")
async def post_message(order_id: str, body: ChatMessageIn):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Pedido não encontrado")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Mensagem vazia")
    msg = {
        "id": str(uuid.uuid4()), "order_id": order_id,
        "from_role": body.from_role, "text": text[:800],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    return msg


# --- Customer ranking (VIPs)
@api_router.get("/admin/customers/ranking")
async def customers_ranking():
    pipeline = [
        {"$group": {
            "_id": "$customer.phone",
            "name": {"$last": "$customer.name"},
            "orders_count": {"$sum": 1},
            "total_spent": {"$sum": "$total"},
            "last_order_at": {"$max": "$created_at"},
            "birthday": {"$last": "$customer.birthday"},
        }},
        {"$sort": {"total_spent": -1, "orders_count": -1}},
        {"$limit": 100},
    ]
    docs = await db.orders.aggregate(pipeline).to_list(100)
    ranking = []
    for d in docs:
        ranking.append({
            "phone": d["_id"], "name": d.get("name") or "-",
            "orders_count": int(d.get("orders_count", 0)),
            "total_spent": round(float(d.get("total_spent", 0)), 2),
            "last_order_at": d.get("last_order_at"),
            "birthday": d.get("birthday"),
        })
    return {"ranking": ranking}


# --- Birthday
@api_router.get("/admin/birthdays/today")
async def birthdays_today():
    today = (datetime.now(timezone.utc) - timedelta(hours=3)).strftime("%m-%d")
    docs = await db.customers.find({}, {"_id": 0}).to_list(500)
    matches = []
    for d in docs:
        bd = d.get("birthday") or ""
        if bd and bd[-5:] == today:
            matches.append(d)
    return {"date": today, "customers": matches}


@api_router.post("/admin/birthdays/send")
async def send_birthdays_today():
    s = await get_settings()
    pct = int(s.get("birthday_coupon_pct", 20))
    today = (datetime.now(timezone.utc) - timedelta(hours=3)).strftime("%m-%d")
    docs = await db.customers.find({}, {"_id": 0}).to_list(500)
    sent = []
    for d in docs:
        bd = d.get("birthday") or ""
        if not bd or bd[-5:] != today:
            continue
        if not d.get("whatsapp_opt_in", True):
            continue
        # Idempotência por dia/cliente
        key = f"birthday:{d['phone']}:{today}"
        already = await db.message_logs.find_one({"idempotency_key": key})
        if already:
            continue
        msg = (
            f"🎉 Feliz aniversário, {d['name']}! A Néia Salgados preparou um mimo pra você: "
            f"cupom ANIVERSARIO{pct} com {pct}% de desconto hoje. Peça já pelo app 💛"
        )
        result = send_whatsapp(d["phone"], body=msg)
        await db.message_logs.insert_one({
            "id": str(uuid.uuid4()), "kind": "birthday", "phone": d["phone"],
            "idempotency_key": key, "result": result,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        sent.append({"phone": d["phone"], "name": d["name"], "result": result})
    return {"date": today, "sent": sent, "twilio_ready": twilio_ready()}


# --- Settings (public + admin)
@api_router.get("/settings")
async def get_public_settings():
    s = await get_settings()
    return {
        "store_name": s.get("store_name"),
        "store_address": s.get("store_address"),
        "store_lat": s.get("store_lat"),
        "store_lng": s.get("store_lng"),
        "base_delivery_fee": s.get("base_delivery_fee"),
        "per_km_fee": s.get("per_km_fee"),
        "min_delivery_fee": s.get("min_delivery_fee"),
        "max_delivery_km": s.get("max_delivery_km"),
        "open_days": s.get("open_days", [1, 2, 3, 4, 5, 6]),
        "open_time": s.get("open_time", "10:00"),
        "close_time": s.get("close_time", "20:00"),
        "birthday_coupon_pct": s.get("birthday_coupon_pct", 20),
        "bulk_tiers": s.get("bulk_tiers", []),
        "loyalty_active": bool(s.get("loyalty_active", True)),
        "loyalty_points_per_real": float(s.get("loyalty_points_per_real", 1.0)),
        "loyalty_tiers": s.get("loyalty_tiers", []),
        "logo_url": s.get("logo_url", ""),
        "pickup_eta_min": int(s.get("pickup_eta_min", 30)),
        "delivery_eta_min": int(s.get("delivery_eta_min", 45)),
    }


@api_router.get("/admin/settings")
async def get_admin_settings():
    s = await get_settings()
    s["twilio_ready"] = twilio_ready()
    return s


@api_router.patch("/admin/settings")
async def update_admin_settings(body: SettingsIn):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nada para atualizar")
    await db.settings.update_one({"id": "singleton"}, {"$set": updates}, upsert=True)
    return await get_settings()


# --- Customer of the Month
@api_router.get("/customers/top-of-month")
async def customer_of_the_month():
    """Retorna o cliente que mais gastou (entregue) no mês corrente + cupom especial pré-criado (20%)."""
    now = datetime.now(timezone.utc) - timedelta(hours=3)  # SP
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        next_month = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    pipeline = [
        {"$match": {
            "status": "entregue",
            "delivered_at": {"$gte": start.isoformat(), "$lt": next_month.isoformat()},
        }},
        {"$group": {
            "_id": "$customer.phone",
            "name": {"$last": "$customer.name"},
            "orders_count": {"$sum": 1},
            "total_spent": {"$sum": "$total"},
        }},
        {"$sort": {"total_spent": -1}},
        {"$limit": 1},
    ]
    docs = await db.orders.aggregate(pipeline).to_list(1)
    if not docs:
        return {"month": start.strftime("%Y-%m"), "customer": None, "coupon": None}
    top = docs[0]
    phone = top["_id"]
    # gerar cupom especial (uma vez por mês por cliente)
    month_key = start.strftime("%Y-%m")
    code = f"TOP{month_key.replace('-','')}-{phone[-4:]}"
    existing = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not existing:
        await db.coupons.insert_one({
            "code": code, "discount_percent": 20, "active": True,
            "belongs_to": phone, "reason": "customer_of_month",
            "max_uses": 1, "uses_count": 0,
            "description": f"🏆 Cliente do Mês {month_key} — 20% off",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return {
        "month": month_key,
        "customer": {
            "phone": phone, "name": top.get("name") or "",
            "orders_count": int(top.get("orders_count", 0)),
            "total_spent": round(float(top.get("total_spent", 0)), 2),
        },
        "coupon": {"code": code, "discount_percent": 20},
    }


# --- Motoboys ranking / financial
@api_router.get("/admin/motoboys/ranking")
async def motoboys_ranking(date: Optional[str] = None, period: Optional[str] = None):
    """Ranking com soma de taxa. period=today|week|month, ou date=YYYY-MM-DD (dia específico)."""
    now = datetime.now(timezone.utc)
    if date:
        try:
            start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            end = start + timedelta(days=1)
            label = start.strftime("%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Data inválida (use YYYY-MM-DD)")
    else:
        today0 = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        if period == "week":
            start = today0 - timedelta(days=6); end = today0 + timedelta(days=1); label = f"Últimos 7 dias"
        elif period == "month":
            start = today0 - timedelta(days=29); end = today0 + timedelta(days=1); label = f"Últimos 30 dias"
        else:  # today (default)
            start = today0; end = today0 + timedelta(days=1); label = start.strftime("%Y-%m-%d")

    motos = await db.motoboys.find({"active": True}, {"_id": 0, "password": 0}).to_list(50)
    results = []
    for m in motos:
        cursor = db.orders.find({
            "motoboy_id": m["id"],
            "status": "entregue",
            "delivered_at": {"$gte": start.isoformat(), "$lt": end.isoformat()},
        }, {"_id": 0})
        deliveries = []
        async for o in cursor:
            try:
                created = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00"))
                delivered = datetime.fromisoformat(o["delivered_at"].replace("Z", "+00:00"))
                mins = (delivered - created).total_seconds() / 60
                deliveries.append({
                    "minutes": round(mins, 1),
                    "total": float(o.get("total", 0)),
                    "delivery_fee": float(o.get("delivery_fee", 0)),
                })
            except Exception:
                continue
        count = len(deliveries)
        avg_minutes = round(sum(d["minutes"] for d in deliveries) / count, 1) if count else None
        revenue = round(sum(d["total"] for d in deliveries), 2)
        delivery_fees_total = round(sum(d["delivery_fee"] for d in deliveries), 2)
        commission_pct = float(m.get("commission_pct", 0) or 0)
        commission_earned = round(delivery_fees_total * commission_pct / 100.0, 2)
        results.append({
            "motoboy_id": m["id"], "name": m["name"], "phone": m["phone"],
            "photo_url": m.get("photo_url", ""),
            "commission_pct": commission_pct,
            "commission_earned": commission_earned,
            "deliveries": count, "avg_minutes": avg_minutes,
            "revenue": revenue, "delivery_fees_total": delivery_fees_total,
        })
    results.sort(key=lambda r: (-r["delivery_fees_total"], r["avg_minutes"] is None, r["avg_minutes"] or 0, -r["deliveries"]))
    totals = {
        "deliveries": sum(r["deliveries"] for r in results),
        "delivery_fees_total": round(sum(r["delivery_fees_total"] for r in results), 2),
        "commission_total": round(sum(r["commission_earned"] for r in results), 2),
        "revenue": round(sum(r["revenue"] for r in results), 2),
    }
    return {"date": label, "period": period or ("range" if date else "today"), "ranking": results, "totals": totals}


# --- Themes
@api_router.get("/themes")
async def list_themes():
    docs = await db.themes.find({}, {"_id": 0}).to_list(50)
    return docs


@api_router.get("/themes/active")
async def list_active_themes():
    docs = await db.themes.find({"active": True}, {"_id": 0}).to_list(50)
    return docs


# --- Orders
@api_router.post("/orders")
async def create_order(payload: OrderCreate):
    for item in payload.items:
        if item.category in ("combo", "frito"):
            if item.quantity <= 0 or item.quantity % 50 != 0:
                raise HTTPException(400, f"Item '{item.product_name}' deve ser em múltiplos de 50 unidades.")
        else:
            if item.quantity <= 0:
                raise HTTPException(400, f"Item '{item.product_name}' deve ter ao menos 1 unidade.")
    subtotal = sum(i.subtotal for i in payload.items)

    settings = await get_settings()

    # Working hours: allow only if store is open now OR if it's a scheduled order
    if not payload.scheduled_for and not is_store_open(settings):
        raise HTTPException(400, "Loja fechada agora. Agende sua entrega ou tente no próximo horário.")

    # Validar agendamento (até 15 dias no futuro)
    if payload.scheduled_for:
        try:
            sched = datetime.fromisoformat(payload.scheduled_for.replace("Z", "+00:00"))
            now_ = datetime.now(timezone.utc)
            if sched < now_ - timedelta(minutes=5):
                raise HTTPException(400, "Data agendada precisa ser no futuro")
            if sched > now_ + timedelta(days=15):
                raise HTTPException(400, "Agendamento máximo é de 15 dias no futuro")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(400, "Data agendada inválida")

    distance_km: Optional[float] = None
    is_pickup_early = (payload.fulfillment_type or "delivery") == "pickup"
    if not is_pickup_early and payload.customer.delivery_lat is not None and payload.customer.delivery_lng is not None:
        distance_km = round(
            haversine_km(
                float(settings["store_lat"]), float(settings["store_lng"]),
                float(payload.customer.delivery_lat), float(payload.customer.delivery_lng),
            ), 2,
        )
        max_km = float(settings.get("max_delivery_km", 15.0))
        if distance_km > max_km:
            raise HTTPException(400, f"Endereço fora da área de entrega ({distance_km} km, máx {max_km} km).")

    # Legacy: keep bairros working when passed
    delivery_fee = compute_delivery(distance_km, settings)
    if payload.customer.neighborhood_id:
        n = await db.neighborhoods.find_one({"id": payload.customer.neighborhood_id, "active": True}, {"_id": 0})
        if n:
            delivery_fee = float(n["delivery_fee"])
            payload.customer.neighborhood_name = n["name"]

    # Retirada no estabelecimento — sem taxa, sem distância, sem motoboy
    is_pickup = (payload.fulfillment_type or "delivery") == "pickup"
    if is_pickup:
        delivery_fee = 0.0
        distance_km = None

    discount = 0.0
    applied_coupon = None
    # Birthday auto-coupon (only if no other coupon and phone has birthday matching today)
    if not payload.coupon_code and payload.customer.birthday:
        try:
            bd = payload.customer.birthday
            mmdd = bd[-5:] if len(bd) >= 5 else ""  # MM-DD
            today_mmdd = (datetime.now(timezone.utc) - timedelta(hours=3)).strftime("%m-%d")
            if mmdd == today_mmdd:
                pct = int(settings.get("birthday_coupon_pct", 20))
                discount = round(subtotal * (pct / 100), 2)
                applied_coupon = f"ANIVERSARIO{pct}"
        except Exception:
            pass

    # Bulk order discount (progressive) — quantity of combo/frito items only
    bulk_qty = sum(i.quantity for i in payload.items if i.category in ("combo", "frito"))
    bulk_pct = 0
    bulk_label = None
    for tier in sorted(settings.get("bulk_tiers", []), key=lambda t: t["min_qty"]):
        if bulk_qty >= tier["min_qty"]:
            bulk_pct = int(tier["discount_pct"])
            bulk_label = tier.get("label")
    if bulk_pct > 0 and (not applied_coupon or applied_coupon.startswith("ANIVERSARIO") is False):
        # Prefer the greater of bulk vs coupon; keep coupon description if it wins
        bulk_disc = round(subtotal * (bulk_pct / 100), 2)
        if bulk_disc > discount:
            discount = bulk_disc
            applied_coupon = f"LOTE{bulk_pct}"

    if payload.coupon_code:
        c = await db.coupons.find_one({"code": payload.coupon_code.upper(), "active": True}, {"_id": 0})
        if not c:
            raise HTTPException(400, "Cupom inválido")
        # Expiração
        exp = c.get("expires_at")
        if exp:
            try:
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                if exp_dt < datetime.now(timezone.utc):
                    raise HTTPException(400, "Cupom expirado")
            except HTTPException:
                raise
            except Exception:
                pass
        # Uso máximo
        if c.get("max_uses") is not None and int(c.get("uses_count", 0)) >= int(c["max_uses"]):
            raise HTTPException(400, "Cupom esgotado")
        # Somente primeira compra
        if c.get("first_order_only"):
            prev = await db.orders.count_documents({"customer.phone": payload.customer.phone})
            if prev > 0:
                raise HTTPException(400, "Cupom válido apenas na 1ª compra")
        # Belongs_to (cupom pessoal)
        if c.get("belongs_to") and c["belongs_to"] != payload.customer.phone:
            raise HTTPException(400, "Cupom pessoal — não pertence a este número")
        code_disc = round(subtotal * (c["discount_percent"] / 100), 2)
        if code_disc > discount:
            discount = code_disc
            applied_coupon = payload.coupon_code.upper()
    else:
        # Auto-aplicar cupom de boas-vindas em 1ª compra
        prev_orders = await db.orders.count_documents({"customer.phone": payload.customer.phone})
        if prev_orders == 0 and discount == 0:
            welcome = await db.coupons.find_one({"code": "BEMVINDO", "active": True}, {"_id": 0})
            if welcome:
                wdisc = round(subtotal * (int(welcome["discount_percent"]) / 100), 2)
                if wdisc > 0:
                    discount = wdisc
                    applied_coupon = "BEMVINDO"

    # Referral logic — new customer's first order using someone's code
    referral_used = payload.referral_code_used.strip().upper() if payload.referral_code_used else None
    referral_owner = None
    if referral_used:
        # code format: AMIGO-XXXX
        referral_owner = await db.customers.find_one({"referral_code": referral_used}, {"_id": 0})
        if referral_owner:
            if referral_owner.get("phone") == payload.customer.phone:
                referral_used = None
                referral_owner = None
            else:
                prev_count = await db.orders.count_documents({"customer.phone": payload.customer.phone})
                if prev_count > 0:
                    # Only valid on very first order
                    referral_used = None
                    referral_owner = None

    if referral_used:
        # 10% off for new customer
        referral_disc = round(subtotal * 0.10, 2)
        if referral_disc > discount:
            discount = referral_disc
            applied_coupon = f"INDIC{referral_used}"

    total = round(subtotal + delivery_fee - discount, 2)

    order = Order(
        customer=payload.customer,
        items=payload.items,
        subtotal=round(subtotal, 2),
        delivery_fee=delivery_fee,
        distance_km=distance_km,
        discount=discount,
        total=total,
        payment_method=payload.payment_method,
        change_for=payload.change_for,
        coupon_code=applied_coupon,
        referral_code_used=referral_used,
        notes=payload.notes,
        scheduled_for=payload.scheduled_for,
        fulfillment_type=(payload.fulfillment_type or "delivery"),
        eta_min=int(settings.get("pickup_eta_min", 30) if (payload.fulfillment_type or "delivery") == "pickup" else settings.get("delivery_eta_min", 45)),
    )
    await db.orders.insert_one(order.model_dump())

    # WhatsApp de confirmação com ETA
    if settings.get("auto_whatsapp") and twilio_ready() and payload.customer.whatsapp_opt_in:
        is_pickup = order.fulfillment_type == "pickup"
        eta = int(order.eta_min or 0)
        eta_line = f"\n⏱️ Previsão de {'retirada' if is_pickup else 'entrega'}: *~{eta} min*." if eta > 0 else ""
        addr_line = f"\n📍 Retire em: {settings.get('store_address', '')}" if is_pickup else ""
        msg = (
            f"🥟 Olá {payload.customer.name}! Recebemos seu pedido *#{order.short_code}*.\n"
            f"Total: *R$ {order.total:.2f}* ({order.payment_method}){eta_line}{addr_line}\n\n"
            f"— *Néia Salgados* — O sabor que faz a diferença 💛"
        )
        try:
            media = await _brand_media_url()
            _r = send_whatsapp(payload.customer.phone, body=msg, media_url=media)
            await db.message_logs.insert_one({
                "id": str(uuid.uuid4()), "kind": "order_received", "order_id": order.id,
                "phone": payload.customer.phone, "result": _r,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass

    # Incrementar uses_count do cupom se foi aplicado (por código real, não bulk/aniv/indic)
    if applied_coupon and not applied_coupon.startswith(("LOTE", "ANIVERSARIO", "INDIC")):
        await db.coupons.update_one({"code": applied_coupon}, {"$inc": {"uses_count": 1}})

    # Upsert customer profile + auto-generate referral code on first save
    existing = await db.customers.find_one({"phone": payload.customer.phone}, {"_id": 0})
    ref_code = existing.get("referral_code") if existing else None
    if not ref_code:
        digits = "".join(ch for ch in payload.customer.phone if ch.isdigit())[-4:] or str(uuid.uuid4())[:4]
        ref_code = f"AMIGO-{digits}"
    updates = {
        "phone": payload.customer.phone,
        "name": payload.customer.name,
        "birthday": payload.customer.birthday,
        "whatsapp_opt_in": bool(payload.customer.whatsapp_opt_in),
        "last_address": payload.customer.address,
        "last_lat": payload.customer.delivery_lat,
        "last_lng": payload.customer.delivery_lng,
        "referral_code": ref_code,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.customers.update_one({"phone": payload.customer.phone}, {"$set": updates}, upsert=True)

    # Reward referrer: create a personal coupon (10% off) once
    if referral_used and referral_owner:
        owner_phone = referral_owner["phone"]
        credit_code = f"AMIGO{owner_phone[-4:]}-{payload.customer.phone[-4:]}"
        existing_credit = await db.coupons.find_one({"code": credit_code})
        if not existing_credit:
            await db.coupons.insert_one({
                "code": credit_code, "discount_percent": 10, "active": True,
                "belongs_to": owner_phone, "reason": "referral",
                "referred_customer": payload.customer.phone,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        await create_notification(
            phone=owner_phone,
            title="🎉 Amigo pediu na Néia!",
            body=f"{payload.customer.name} usou seu código {ref_code}. Você ganhou o cupom {credit_code} com 10% off!",
            kind="referral",
        )

    return order.model_dump()


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str):
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pedido não encontrado")
    if doc.get("motoboy_id"):
        m = await db.motoboys.find_one({"id": doc["motoboy_id"]}, {"_id": 0})
        if m:
            doc["motoboy_location"] = {
                "lat": m.get("current_lat"),
                "lng": m.get("current_lng"),
                "last_ping": m.get("last_ping"),
                "name": m.get("name"),
                "phone": m.get("phone"),
                "photo_url": m.get("photo_url") or "",
            }
    return doc


@api_router.get("/orders")
async def list_orders_by_phone(phone: str):
    docs = await db.orders.find({"customer.phone": phone}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return docs


# --- Coupons
@api_router.get("/coupons/validate/{code}")
async def validate_coupon(code: str):
    c = await db.coupons.find_one({"code": code.upper(), "active": True}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Cupom inválido")
    return c


# --- Motoboy
@api_router.post("/motoboy/login")
async def motoboy_login(payload: MotoboyLogin):
    m = await db.motoboys.find_one({"phone": payload.phone, "password": payload.password, "active": True}, {"_id": 0, "password": 0})
    if not m:
        raise HTTPException(401, "Credenciais inválidas")
    return m


@api_router.get("/motoboy/{motoboy_id}/orders")
async def motoboy_orders(motoboy_id: str):
    docs = await db.orders.find(
        {"motoboy_id": motoboy_id, "status": {"$in": ["saiu_entrega", "fritando", "recebido"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return docs


@api_router.post("/motoboy/{motoboy_id}/location")
async def update_location(motoboy_id: str, loc: LocationUpdate):
    now = datetime.now(timezone.utc).isoformat()
    r = await db.motoboys.update_one(
        {"id": motoboy_id},
        {"$set": {"current_lat": loc.lat, "current_lng": loc.lng, "last_ping": now}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Motoboy não encontrado")
    return {"ok": True, "lat": loc.lat, "lng": loc.lng, "last_ping": now}


@api_router.post("/motoboy/{motoboy_id}/start-delivery/{order_id}")
async def start_delivery(motoboy_id: str, order_id: str):
    now = datetime.now(timezone.utc).isoformat()
    r = await db.orders.update_one(
        {"id": order_id, "motoboy_id": motoboy_id},
        {"$set": {"status": "saiu_entrega", "updated_at": now}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Pedido não encontrado ou não atribuído")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    # In-app notification
    if order:
        await create_notification(
            phone=order["customer"]["phone"],
            title=f"🛵 Pedido #{order['short_code']} a caminho",
            body=f"Seu entregador saiu com o pedido. Acompanhe em tempo real!",
            kind="status", order_id=order_id,
        )
    # WhatsApp com link de acompanhamento
    notify = await notify_customer_out_for_delivery(order or {})
    if order:
        await db.message_logs.insert_one({
            "id": str(uuid.uuid4()), "kind": "out_for_delivery",
            "order_id": order_id, "phone": order["customer"]["phone"],
            "result": notify, "created_at": now,
        })
    return {"ok": True, "notification": notify}


@api_router.post("/motoboy/{motoboy_id}/complete/{order_id}")
async def complete_delivery(motoboy_id: str, order_id: str):
    now = datetime.now(timezone.utc).isoformat()
    prev = await db.orders.find_one({"id": order_id, "motoboy_id": motoboy_id}, {"_id": 0})
    r = await db.orders.update_one(
        {"id": order_id, "motoboy_id": motoboy_id},
        {"$set": {"status": "entregue", "updated_at": now, "delivered_at": now}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Pedido não encontrado")
    # Award loyalty points
    if prev and prev.get("status") != "entregue":
        s_ = await get_settings()
        if bool(s_.get("loyalty_active", True)):
            ratio = float(s_.get("loyalty_points_per_real", 1.0) or 1.0)
            pts = int(float(prev.get("total", 0)) * ratio)
            if pts > 0:
                await db.customers.update_one(
                    {"phone": prev["customer"]["phone"]},
                    {"$inc": {"points": pts}, "$set": {"updated_at": now}},
                    upsert=True,
                )
                await create_notification(
                    phone=prev["customer"]["phone"],
                    title=f"🏆 +{pts} pontos!",
                    body=f"Você ganhou {pts} pontos pelo pedido #{prev['short_code']}.",
                    kind="loyalty", order_id=order_id,
                )
    return {"ok": True}


# --- Admin
@api_router.post("/admin/login")
async def admin_login(payload: AdminLogin):
    if payload.password != ADMIN_PASSWORD:
        raise HTTPException(401, "Senha inválida")
    return {"ok": True, "token": "admin-session"}


@api_router.get("/admin/orders")
async def admin_list_orders(status: Optional[str] = None):
    q = {}
    if status:
        q["status"] = status
    docs = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api_router.patch("/admin/orders/{order_id}/status")
async def admin_update_status(order_id: str, body: StatusUpdate):
    now = datetime.now(timezone.utc).isoformat()
    updates = {"status": body.status, "updated_at": now}
    if body.status == "entregue":
        updates["delivered_at"] = now
    # Estado anterior para saber se estamos entregando pela 1ª vez
    prev = await db.orders.find_one({"id": order_id}, {"_id": 0})
    r = await db.orders.update_one({"id": order_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Pedido não encontrado")

    # Conceder pontos de fidelidade ao entregar (usa loyalty_points_per_real, apenas na 1ª vez)
    if body.status == "entregue" and prev and prev.get("status") != "entregue":
        s_ = await get_settings()
        if bool(s_.get("loyalty_active", True)):
            ratio = float(s_.get("loyalty_points_per_real", 1.0) or 1.0)
            pts = int(float(prev.get("total", 0)) * ratio)
            if pts > 0:
                await db.customers.update_one(
                    {"phone": prev["customer"]["phone"]},
                    {"$inc": {"points": pts}, "$set": {"updated_at": now}},
                    upsert=True,
                )
                await create_notification(
                    phone=prev["customer"]["phone"],
                    title=f"🏆 +{pts} pontos!",
                    body=f"Você ganhou {pts} pontos de fidelidade pelo pedido #{prev['short_code']}.",
                    kind="loyalty", order_id=order_id,
                )

    # Auto-notificar via WhatsApp (Twilio) se configurado e habilitado
    settings = await get_settings()
    notify_result: dict = {"sent": False, "reason": "auto_disabled"}
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    # In-app notification for the customer
    if order:
        labels_short = {"recebido": "recebido", "fritando": "em preparo",
                        "saiu_entrega": "saiu para entrega", "entregue": "entregue",
                        "cancelado": "cancelado"}
        label_s = labels_short.get(body.status, body.status)
        await create_notification(
            phone=order["customer"]["phone"],
            title=f"Pedido #{order['short_code']} — {label_s}",
            body=f"Seu pedido agora está {label_s}. Toque para acompanhar.",
            kind="status", order_id=order_id,
        )
    if settings.get("auto_whatsapp") and twilio_ready() and order:
        if order["customer"].get("whatsapp_opt_in", True):
            is_pickup = (order.get("fulfillment_type") or "delivery") == "pickup"
            eta = int(order.get("eta_min") or 0)
            if body.status == "saiu_entrega":
                if is_pickup:
                    # Para retirada: aviso "pronto pra retirada"
                    msg = (
                        f"🎉 Olá {order['customer']['name']}! Seu pedido *#{order['short_code']}* está *PRONTO*!\n"
                        f"📍 Retire em: {settings.get('store_address', 'Néia Salgados')}\n\n"
                        f"— *Néia Salgados* — O sabor que faz a diferença 💛"
                    )
                    media = await _brand_media_url()
                    r2 = send_whatsapp(order["customer"]["phone"], body=msg, media_url=media)
                else:
                    r2 = await notify_customer_out_for_delivery(order)
            else:
                labels = {"recebido": "🥟 recebido", "fritando": "🔥 em preparo",
                          "saiu_entrega": "🛵 saiu para entrega", "entregue": "✅ entregue",
                          "cancelado": "❌ cancelado"}
                label = labels.get(body.status, body.status)
                # ETA no primeiro aviso
                eta_line = ""
                if body.status == "recebido" and eta > 0:
                    eta_line = f"\n⏱️ Previsão: *~{eta} min* para {'retirada' if is_pickup else 'entrega'}."
                msg = (
                    f"Olá {order['customer']['name']}! Seu pedido *#{order['short_code']}* na Néia Salgados "
                    f"está {label}.{eta_line}\n\n"
                    f"— *Néia Salgados* — O sabor que faz a diferença 💛"
                )
                media = await _brand_media_url()
                r2 = send_whatsapp(order["customer"]["phone"], body=msg, media_url=media)
            notify_result = r2
            await db.message_logs.insert_one({
                "id": str(uuid.uuid4()), "kind": "status", "order_id": order_id,
                "phone": order["customer"]["phone"], "status": body.status,
                "result": r2, "created_at": now,
            })
    return {"ok": True, "notification": notify_result}


@api_router.post("/admin/orders/{order_id}/assign")
async def admin_assign(order_id: str, body: AssignMotoboy):
    m = await db.motoboys.find_one({"id": body.motoboy_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Motoboy não encontrado")
    now = datetime.now(timezone.utc).isoformat()
    r = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"motoboy_id": m["id"], "motoboy_name": m["name"], "updated_at": now}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Pedido não encontrado")

    # Enviar WhatsApp para o motoboy com endereço + link do Google Maps
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    notify: dict = {"sent": False, "reason": "twilio_not_configured"}
    if order and twilio_ready():
        try:
            lat = order["customer"].get("delivery_lat")
            lng = order["customer"].get("delivery_lng")
            addr = order["customer"].get("address", "")
            comp = order["customer"].get("complement", "")
            maps_link = (
                f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
                if lat and lng else
                f"https://www.google.com/maps/search/?api=1&query={requests.utils.quote(addr)}"
            )
            msg = (
                f"🛵 *Nova entrega — Néia Salgados*\n\n"
                f"Pedido: *#{order['short_code']}*\n"
                f"Cliente: {order['customer']['name']} — {order['customer']['phone']}\n"
                f"Endereço: {addr}{(' • ' + comp) if comp else ''}\n"
                f"Total: R$ {order['total']:.2f} ({order.get('payment_method','')})\n\n"
                f"📍 Abrir no maps: {maps_link}"
            )
            notify = send_whatsapp(m["phone"], body=msg)
            await db.message_logs.insert_one({
                "id": str(uuid.uuid4()), "kind": "assign_motoboy",
                "order_id": order_id, "phone": m["phone"], "result": notify,
                "created_at": now,
            })
        except Exception as e:
            notify = {"sent": False, "reason": str(e)}
    return {"ok": True, "motoboy_name": m["name"], "notification": notify}


@api_router.get("/admin/motoboys")
async def admin_list_motoboys():
    docs = await db.motoboys.find({"active": True}, {"_id": 0, "password": 0}).to_list(50)
    return docs


@api_router.get("/admin/motoboys/all")
async def admin_list_all_motoboys():
    docs = await db.motoboys.find({}, {"_id": 0, "password": 0}).sort("name", 1).to_list(100)
    return docs


@api_router.post("/admin/motoboys")
async def admin_create_motoboy(body: MotoboyIn):
    if not body.name.strip() or not body.phone.strip() or not body.password.strip():
        raise HTTPException(400, "Nome, telefone e senha são obrigatórios")
    exists = await db.motoboys.find_one({"phone": body.phone.strip()})
    if exists:
        raise HTTPException(400, "Já existe motoboy com esse telefone")
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "phone": body.phone.strip(),
        "password": body.password.strip(),
        "photo_url": body.photo_url or "",
        "active": bool(body.active),
        "commission_pct": float(body.commission_pct or 0.0),
        "current_lat": None, "current_lng": None, "last_ping": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.motoboys.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password", None)
    return doc


@api_router.patch("/admin/motoboys/{motoboy_id}")
async def admin_update_motoboy(motoboy_id: str, body: MotoboyPatch):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nada para atualizar")
    if "phone" in updates:
        clash = await db.motoboys.find_one({"phone": updates["phone"], "id": {"$ne": motoboy_id}})
        if clash:
            raise HTTPException(400, "Já existe motoboy com esse telefone")
    r = await db.motoboys.update_one({"id": motoboy_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Motoboy não encontrado")
    return {"ok": True}


@api_router.delete("/admin/motoboys/{motoboy_id}")
async def admin_delete_motoboy(motoboy_id: str):
    r = await db.motoboys.update_one({"id": motoboy_id}, {"$set": {"active": False}})
    if r.matched_count == 0:
        raise HTTPException(404, "Motoboy não encontrado")
    return {"ok": True}


# Admin — Products
@api_router.get("/admin/products")
async def admin_list_products():
    docs = await db.products.find({}, {"_id": 0}).sort("category", 1).to_list(200)
    return docs


@api_router.patch("/admin/products/{product_id}")
async def admin_update_product(product_id: str, body: ProductPatch):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nada para atualizar")
    r = await db.products.update_one({"id": product_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Produto não encontrado")
    return {"ok": True}


@api_router.post("/admin/products")
async def admin_create_product(body: ProductCreate):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["is_featured"] = False
    doc["theme"] = None
    doc["active"] = True
    doc["image_urls"] = []
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str):
    r = await db.products.update_one({"id": product_id}, {"$set": {"active": False}})
    if r.matched_count == 0:
        raise HTTPException(404, "Produto não encontrado")
    return {"ok": True}


# Admin — Print Templates & Printers
@api_router.get("/admin/print-templates")
async def list_print_templates():
    docs = await db.print_templates.find({}, {"_id": 0}).sort("width_mm", 1).to_list(50)
    return docs


@api_router.post("/admin/print-templates")
async def create_print_template(body: PrintTemplateIn):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.print_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/admin/print-templates/{template_id}")
async def update_print_template(template_id: str, body: PrintTemplatePatch):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nada para atualizar")
    r = await db.print_templates.update_one({"id": template_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Modelo não encontrado")
    return {"ok": True}


@api_router.delete("/admin/print-templates/{template_id}")
async def delete_print_template(template_id: str):
    r = await db.print_templates.delete_one({"id": template_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Modelo não encontrado")
    return {"ok": True}


@api_router.get("/admin/printers")
async def list_printers():
    docs = await db.printers.find({}, {"_id": 0}).to_list(50)
    return docs


@api_router.post("/admin/printers")
async def create_printer(body: PrinterIn):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    # Se for default, desmarcar os outros
    if doc.get("is_default"):
        await db.printers.update_many({}, {"$set": {"is_default": False}})
    await db.printers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/admin/printers/{printer_id}")
async def update_printer(printer_id: str, body: PrinterPatch):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nada para atualizar")
    if updates.get("is_default"):
        await db.printers.update_many({"id": {"$ne": printer_id}}, {"$set": {"is_default": False}})
    r = await db.printers.update_one({"id": printer_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Impressora não encontrada")
    return {"ok": True}


@api_router.delete("/admin/printers/{printer_id}")
async def delete_printer(printer_id: str):
    r = await db.printers.delete_one({"id": printer_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Impressora não encontrada")
    return {"ok": True}


@api_router.get("/admin/orders/{order_id}/receipt")
async def get_order_receipt(order_id: str, printer_id: Optional[str] = None):
    """Retorna a comanda renderizada (texto + HTML) pronta para impressão."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Pedido não encontrado")

    # escolher impressora
    printer = None
    if printer_id:
        printer = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not printer:
        printer = await db.printers.find_one({"is_default": True, "active": True}, {"_id": 0}) \
            or await db.printers.find_one({"active": True}, {"_id": 0})
    template = None
    if printer and printer.get("template_id"):
        template = await db.print_templates.find_one({"id": printer["template_id"]}, {"_id": 0})
    if not template:
        template = await db.print_templates.find_one({"active": True}, {"_id": 0})
    if not template:
        raise HTTPException(400, "Nenhum modelo de impressão configurado")

    # renderizar
    items_txt = "\n".join(
        f"{i.get('quantity',0)}x {i.get('product_name','')}  R$ {i.get('subtotal',0):.2f}"
        for i in order.get("items", [])
    )
    ctx = {
        "short_code": order.get("short_code", ""),
        "created_at": order.get("created_at", "")[:19].replace("T", " "),
        "customer_name": order["customer"].get("name", ""),
        "customer_phone": order["customer"].get("phone", ""),
        "customer_address": (order["customer"].get("address", "")
                             + ((" • " + order["customer"].get("complement", "")) if order["customer"].get("complement") else "")),
        "items": items_txt,
        "subtotal": f"{order.get('subtotal',0):.2f}",
        "delivery_fee": f"{order.get('delivery_fee',0):.2f}",
        "discount": f"{order.get('discount',0):.2f}",
        "total": f"{order.get('total',0):.2f}",
        "payment_method": order.get("payment_method", ""),
        "notes": order.get("notes", "") or "",
    }
    def _render(s: str) -> str:
        try: return s.format(**ctx)
        except Exception: return s
    text = _render(template.get("header", "")) + _render(template.get("body_template", "")) + _render(template.get("footer", ""))
    return {
        "text": text,
        "width_mm": template.get("width_mm", 80),
        "printer": {"id": printer["id"], "name": printer["name"]} if printer else None,
        "template": {"id": template["id"], "name": template["name"]},
    }


# Admin — Coupons
@api_router.get("/admin/coupons")
async def admin_list_coupons():
    docs = await db.coupons.find({}, {"_id": 0}).sort("code", 1).to_list(200)
    return docs


@api_router.post("/admin/coupons")
async def admin_create_coupon(body: CouponIn):
    doc = body.model_dump()
    doc["code"] = doc["code"].upper().strip()
    if not doc["code"]:
        raise HTTPException(400, "Código obrigatório")
    if doc["discount_percent"] <= 0 or doc["discount_percent"] > 100:
        raise HTTPException(400, "Percentual entre 1 e 100")
    exists = await db.coupons.find_one({"code": doc["code"]})
    if exists:
        raise HTTPException(400, "Já existe cupom com esse código")
    doc["uses_count"] = 0
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/admin/coupons/{code}")
async def admin_update_coupon(code: str, body: CouponPatch):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nada para atualizar")
    r = await db.coupons.update_one({"code": code.upper()}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Cupom não encontrado")
    return {"ok": True}


@api_router.delete("/admin/coupons/{code}")
async def admin_delete_coupon(code: str):
    r = await db.coupons.delete_one({"code": code.upper()})
    if r.deleted_count == 0:
        raise HTTPException(404, "Cupom não encontrado")
    return {"ok": True}


# Admin — Neighborhoods
@api_router.get("/admin/neighborhoods")
async def admin_list_neighborhoods():
    docs = await db.neighborhoods.find({}, {"_id": 0}).sort("delivery_fee", 1).to_list(200)
    return docs


@api_router.post("/admin/neighborhoods")
async def admin_create_neighborhood(body: NeighborhoodIn):
    n = Neighborhood(**body.model_dump())
    await db.neighborhoods.insert_one(n.model_dump())
    return n.model_dump()


@api_router.patch("/admin/neighborhoods/{neighborhood_id}")
async def admin_update_neighborhood(neighborhood_id: str, body: NeighborhoodIn):
    r = await db.neighborhoods.update_one({"id": neighborhood_id}, {"$set": body.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Bairro não encontrado")
    return {"ok": True}


@api_router.delete("/admin/neighborhoods/{neighborhood_id}")
async def admin_delete_neighborhood(neighborhood_id: str):
    r = await db.neighborhoods.update_one({"id": neighborhood_id}, {"$set": {"active": False}})
    if r.matched_count == 0:
        raise HTTPException(404, "Bairro não encontrado")
    return {"ok": True}


# Admin — Themes
@api_router.get("/admin/themes")
async def admin_list_themes():
    docs = await db.themes.find({}, {"_id": 0}).to_list(50)
    return docs


@api_router.post("/admin/themes")
async def admin_create_theme(body: ThemeIn):
    t = Theme(**body.model_dump())
    await db.themes.insert_one(t.model_dump())
    return t.model_dump()


@api_router.patch("/admin/themes/{theme_id}/toggle")
async def admin_toggle_theme(theme_id: str, body: ThemeToggle):
    r = await db.themes.update_one({"id": theme_id}, {"$set": {"active": body.active}})
    if r.matched_count == 0:
        raise HTTPException(404, "Tema não encontrado")
    return {"ok": True}


# Admin — Upload
@api_router.post("/admin/upload")
async def admin_upload(file: UploadFile = File(...)):
    ext = (file.filename or "").split(".")[-1].lower() or "jpg"
    if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/products/{uuid.uuid4()}.{ext}"
    data = await file.read()
    content_type = file.content_type or "image/jpeg"
    await run_in_threadpool(_put_object, path, data, content_type)
    await db.uploads.insert_one({"id": str(uuid.uuid4()), "path": path, "size": len(data),
                                 "content_type": content_type,
                                 "created_at": datetime.now(timezone.utc).isoformat()})
    return {"path": path, "url": f"/api/files/{path}"}


@api_router.get("/files/{path:path}")
async def get_file(path: str):
    from fastapi.responses import Response
    try:
        data, ct = await run_in_threadpool(_get_object, path)
    except Exception:
        raise HTTPException(404, "Arquivo não encontrado")
    return Response(content=data, media_type=ct)


# ============ APP SETUP ============
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await seed_data()
    try:
        await run_in_threadpool(_init_storage)
        logger.info("Storage init OK")
    except Exception as e:
        logger.warning(f"Storage init falhou: {e}")
    logger.info("Seed OK")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
