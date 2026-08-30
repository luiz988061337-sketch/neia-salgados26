from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from starlette.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import requests
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone


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
    neighborhood_id: Optional[str] = None
    neighborhood_name: Optional[str] = None


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    short_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:6].upper())
    customer: Customer
    items: List[OrderItem]
    subtotal: float
    delivery_fee: float = 0.0
    discount: float = 0.0
    total: float
    payment_method: PaymentMethod
    change_for: Optional[float] = None
    coupon_code: Optional[str] = None
    status: OrderStatus = "recebido"
    motoboy_id: Optional[str] = None
    motoboy_name: Optional[str] = None
    notes: Optional[str] = ""
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

    # Delivery fee from neighborhood
    delivery_fee = 8.0
    neighborhood_name = None
    if payload.customer.neighborhood_id:
        n = await db.neighborhoods.find_one({"id": payload.customer.neighborhood_id, "active": True}, {"_id": 0})
        if n:
            delivery_fee = float(n["delivery_fee"])
            neighborhood_name = n["name"]
        else:
            raise HTTPException(400, "Bairro inválido")
    payload.customer.neighborhood_name = neighborhood_name

    discount = 0.0
    if payload.coupon_code:
        c = await db.coupons.find_one({"code": payload.coupon_code.upper(), "active": True}, {"_id": 0})
        if not c:
            raise HTTPException(400, "Cupom inválido")
        discount = round(subtotal * (c["discount_percent"] / 100), 2)

    total = round(subtotal + delivery_fee - discount, 2)

    order = Order(
        customer=payload.customer,
        items=payload.items,
        subtotal=round(subtotal, 2),
        delivery_fee=delivery_fee,
        discount=discount,
        total=total,
        payment_method=payload.payment_method,
        change_for=payload.change_for,
        coupon_code=payload.coupon_code.upper() if payload.coupon_code else None,
        notes=payload.notes,
    )
    await db.orders.insert_one(order.model_dump())
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
        {"$set": {"status": "entregue", "updated_at": now}}
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
    r = await db.orders.update_one({"id": order_id}, {"$set": {"status": body.status, "updated_at": now}})
    if r.matched_count == 0:
        raise HTTPException(404, "Pedido não encontrado")
    return {"ok": True}


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
