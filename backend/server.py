from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
    price: float           # price per unit for congelado/frito, per combo for combo
    unit_size: int         # 50 for combo/frito, 1 for congelado
    image_url: str
    flavors: List[str] = []  # available flavors for fritos/combos
    is_featured: bool = False
    active: bool = True


class OrderItem(BaseModel):
    product_id: str
    product_name: str
    category: ProductCategory
    quantity: int          # total units
    unit_price: float
    subtotal: float
    flavors: dict = {}     # {"coxinha": 25, "kibe": 25}


class Customer(BaseModel):
    name: str
    phone: str
    address: str
    complement: Optional[str] = ""


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    short_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:6].upper())
    customer: Customer
    items: List[OrderItem]
    subtotal: float
    delivery_fee: float = 8.0
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


class Coupon(BaseModel):
    code: str
    discount_percent: int
    active: bool = True


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


# ============ HELPERS ============
def clean_doc(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


async def seed_data():
    # Products
    if await db.products.count_documents({}) == 0:
        seed_products = [
            {
                "id": str(uuid.uuid4()), "name": "Combo Festa 50", "description": "50 salgados fritos sortidos (coxinha, kibe, risole, bolinha de queijo). Ideal para pequenas reuniões.",
                "category": "combo", "price": 79.90, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1641848462741-982725a92e49?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHw0fHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": ["Coxinha", "Kibe", "Risole", "Bolinha de Queijo", "Enroladinho"],
                "is_featured": True, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Combo Aniversário 100", "description": "100 salgados fritos sortidos + 20 mini docinhos brasileiros.",
                "category": "combo", "price": 159.90, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1598142982901-df6cec10ae35?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": ["Coxinha", "Kibe", "Risole", "Bolinha de Queijo", "Enroladinho", "Croquete"],
                "is_featured": True, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Coxinha de Frango", "description": "Coxinha tradicional recheada com frango desfiado. Vendida em lotes de 50 unidades.",
                "category": "frito", "price": 1.60, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1623653387945-2fd25214f8fc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwyfHxhcHBldGl6aW5nJTIwZnJpZWQlMjBzbmFja3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": [], "is_featured": False, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Kibe Recheado", "description": "Kibe crocante recheado com catupiry. Lotes de 50 unidades.",
                "category": "frito", "price": 1.80, "unit_size": 50,
                "image_url": "https://images.unsplash.com/photo-1641848462741-982725a92e49?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHw0fHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": [], "is_featured": False, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Coxinha Congelada", "description": "Coxinha crua congelada. Pronta para fritar em casa. Venda por unidade.",
                "category": "congelado", "price": 1.20, "unit_size": 1,
                "image_url": "https://images.unsplash.com/photo-1598142982901-df6cec10ae35?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxicmF6aWxpYW4lMjBjb3hpbmhhJTIwc2FsZ2FkaW5ob3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": [], "is_featured": False, "active": True,
            },
            {
                "id": str(uuid.uuid4()), "name": "Kit Congelado 30un", "description": "Kit com 30 salgados congelados sortidos. Venda a partir de 1 kit.",
                "category": "congelado", "price": 34.90, "unit_size": 1,
                "image_url": "https://images.unsplash.com/photo-1623653387945-2fd25214f8fc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwyfHxhcHBldGl6aW5nJTIwZnJpZWQlMjBzbmFja3N8ZW58MHx8fHwxNzg4MDU4MDY2fDA&ixlib=rb-4.1.0&q=85",
                "flavors": [], "is_featured": True, "active": True,
            },
        ]
        await db.products.insert_many(seed_products)

    # Motoboys
    if await db.motoboys.count_documents({}) == 0:
        await db.motoboys.insert_many([
            {"id": str(uuid.uuid4()), "name": "Carlos Silva", "phone": "11999990001", "password": "1234",
             "photo_url": "", "active": True, "current_lat": None, "current_lng": None, "last_ping": None},
            {"id": str(uuid.uuid4()), "name": "Marcos Souza", "phone": "11999990002", "password": "1234",
             "photo_url": "", "active": True, "current_lat": None, "current_lng": None, "last_ping": None},
        ])

    # Coupons
    if await db.coupons.count_documents({}) == 0:
        await db.coupons.insert_many([
            {"code": "NEIA10", "discount_percent": 10, "active": True},
            {"code": "PRIMEIRO", "discount_percent": 15, "active": True},
        ])


# ============ ROUTES ============
@api_router.get("/")
async def root():
    return {"message": "Néia Salgados API"}


# --- Products
@api_router.get("/products")
async def list_products(category: Optional[str] = None):
    q = {"active": True}
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


# --- Orders
@api_router.post("/orders")
async def create_order(payload: OrderCreate):
    # validate 50-in-50 for combos & fritos
    for item in payload.items:
        if item.category in ("combo", "frito"):
            if item.quantity <= 0 or item.quantity % 50 != 0:
                raise HTTPException(400, f"Item '{item.product_name}' deve ser em múltiplos de 50 unidades.")
        else:
            if item.quantity <= 0:
                raise HTTPException(400, f"Item '{item.product_name}' deve ter ao menos 1 unidade.")

    subtotal = sum(i.subtotal for i in payload.items)
    discount = 0.0
    if payload.coupon_code:
        c = await db.coupons.find_one({"code": payload.coupon_code.upper(), "active": True}, {"_id": 0})
        if not c:
            raise HTTPException(400, "Cupom inválido")
        discount = round(subtotal * (c["discount_percent"] / 100), 2)

    delivery_fee = 8.0
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
    # attach motoboy location
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
    logger.info("Seed OK")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
