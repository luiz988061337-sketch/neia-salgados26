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

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'neia2026')
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


def send_whatsapp(phone: str, body: Optional[str] = None, template_sid: Optional[str] = None, variables: Optional[dict] = None) -> dict:
    client = twilio_client()
    if not client:
        return {"sent": False, "reason": "twilio_not_configured"}
    try:
        to = _phone_to_whatsapp(phone)
        kwargs = {"from_": TWILIO_WHATSAPP_FROM, "to": to}
        if template_sid:
            import json as _j
            kwargs["content_sid"] = template_sid
            kwargs["content_variables"] = _j.dumps(variables or {}, ensure_ascii=False)
        else:
            kwargs["body"] = body or ""
        msg = client.messages.create(**kwargs)
        return {"sent": True, "sid": msg.sid, "status": msg.status}
    except Exception as e:
        return {"sent": False, "reason": str(e)}

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ MODELS ============
ProductCategory = Literal["combo", "frito", "congelado"]
OrderStatus = Literal["recebido", "fritando", "saiu_entrega", "entregue", "cancelado"]
PaymentMethod = Literal["pix", "dinheiro", "cartao"]


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    category: ProductCategory
    price: float
    unit_size: int
    image_url: str
    flavors: List[str] = []
    is_featured: bool = False
    theme: Optional[str] = None  # links to a Theme.name; None = always visible
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
    scheduled_for: Optional[str] = None  # ISO datetime; when the customer wants delivery
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
    notes: Optional[str] = ""
    scheduled_for: Optional[str] = None


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
    bulk_tiers: Optional[List[dict]] = None  # [{min_qty:int, discount_pct:int, label:str}]


class ChatMessageIn(BaseModel):
    order_id: str
    from_role: Literal["customer", "motoboy"]
    text: str


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
    flavors: Optional[List[str]] = None
    is_featured: Optional[bool] = None
    theme: Optional[str] = None
    active: Optional[bool] = None


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

    if await db.motoboys.count_documents({}) == 0:
        await db.motoboys.insert_many([
            {"id": str(uuid.uuid4()), "name": "Carlos Silva", "phone": "11999990001", "password": "1234",
             "photo_url": "", "active": True, "current_lat": None, "current_lng": None, "last_ping": None},
            {"id": str(uuid.uuid4()), "name": "Marcos Souza", "phone": "11999990002", "password": "1234",
             "photo_url": "", "active": True, "current_lat": None, "current_lng": None, "last_ping": None},
        ])

    if await db.coupons.count_documents({}) == 0:
        await db.coupons.insert_many([
            {"code": "NEIA10", "discount_percent": 10, "active": True},
            {"code": "PRIMEIRO", "discount_percent": 15, "active": True},
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


# ============ ROUTES ============
@api_router.get("/")
async def root():
    return {"message": "Néia Salgados API"}


# --- Products
@api_router.get("/products")
async def list_products(category: Optional[str] = None):
    active_themes = [t["name"] async for t in db.themes.find({"active": True}, {"_id": 0, "name": 1})]
    q = {
        "active": True,
        "$or": [{"theme": None}, {"theme": {"$in": active_themes}}],
    }
    if category:
        q["category"] = category
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


# --- Motoboys ranking
@api_router.get("/admin/motoboys/ranking")
async def motoboys_ranking(date: Optional[str] = None):
    """Ranking do dia. Data no formato YYYY-MM-DD (UTC). Sem date = hoje."""
    if date:
        try:
            day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "Data inválida (use YYYY-MM-DD)")
    else:
        now = datetime.now(timezone.utc)
        day = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    next_day = day + timedelta(days=1)

    motos = await db.motoboys.find({"active": True}, {"_id": 0, "password": 0}).to_list(50)
    results = []
    for m in motos:
        cursor = db.orders.find({
            "motoboy_id": m["id"],
            "status": "entregue",
            "delivered_at": {"$gte": day.isoformat(), "$lt": next_day.isoformat()},
        }, {"_id": 0, "created_at": 1, "delivered_at": 1, "total": 1})
        deliveries = []
        async for o in cursor:
            try:
                created = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00"))
                delivered = datetime.fromisoformat(o["delivered_at"].replace("Z", "+00:00"))
                mins = (delivered - created).total_seconds() / 60
                deliveries.append({"minutes": round(mins, 1), "total": float(o.get("total", 0))})
            except Exception:
                continue
        count = len(deliveries)
        avg_minutes = round(sum(d["minutes"] for d in deliveries) / count, 1) if count else None
        revenue = round(sum(d["total"] for d in deliveries), 2)
        results.append({
            "motoboy_id": m["id"], "name": m["name"], "phone": m["phone"],
            "deliveries": count, "avg_minutes": avg_minutes, "revenue": revenue,
        })
    # Sort: fewer avg minutes first (None goes last), then more deliveries first
    results.sort(key=lambda r: (r["avg_minutes"] is None, r["avg_minutes"] or 0, -r["deliveries"]))
    return {"date": day.strftime("%Y-%m-%d"), "ranking": results}


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

    distance_km: Optional[float] = None
    if payload.customer.delivery_lat is not None and payload.customer.delivery_lng is not None:
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
        code_disc = round(subtotal * (c["discount_percent"] / 100), 2)
        if code_disc > discount:
            discount = code_disc
            applied_coupon = payload.coupon_code.upper()

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
        notes=payload.notes,
        scheduled_for=payload.scheduled_for,
    )
    await db.orders.insert_one(order.model_dump())

    # Upsert customer profile
    await db.customers.update_one(
        {"phone": payload.customer.phone},
        {"$set": {
            "phone": payload.customer.phone,
            "name": payload.customer.name,
            "birthday": payload.customer.birthday,
            "whatsapp_opt_in": bool(payload.customer.whatsapp_opt_in),
            "last_address": payload.customer.address,
            "last_lat": payload.customer.delivery_lat,
            "last_lng": payload.customer.delivery_lng,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
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
    return {"ok": True}


@api_router.post("/motoboy/{motoboy_id}/complete/{order_id}")
async def complete_delivery(motoboy_id: str, order_id: str):
    now = datetime.now(timezone.utc).isoformat()
    r = await db.orders.update_one(
        {"id": order_id, "motoboy_id": motoboy_id},
        {"$set": {"status": "entregue", "updated_at": now, "delivered_at": now}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Pedido não encontrado")
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
    r = await db.orders.update_one({"id": order_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Pedido não encontrado")

    # Auto-notificar via WhatsApp (Twilio) se configurado e habilitado
    settings = await get_settings()
    notify_result: dict = {"sent": False, "reason": "auto_disabled"}
    if settings.get("auto_whatsapp") and twilio_ready():
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order and order["customer"].get("whatsapp_opt_in", True):
            labels = {"recebido": "🥟 recebido", "fritando": "🔥 em preparo",
                      "saiu_entrega": "🛵 saiu para entrega", "entregue": "✅ entregue",
                      "cancelado": "❌ cancelado"}
            label = labels.get(body.status, body.status)
            msg = (
                f"Olá {order['customer']['name']}! Seu pedido *#{order['short_code']}* na Néia Salgados "
                f"está {label}."
            )
            r2 = send_whatsapp(order["customer"]["phone"], body=msg)
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
    return {"ok": True, "motoboy_name": m["name"]}


@api_router.get("/admin/motoboys")
async def admin_list_motoboys():
    docs = await db.motoboys.find({"active": True}, {"_id": 0, "password": 0}).to_list(50)
    return docs


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
