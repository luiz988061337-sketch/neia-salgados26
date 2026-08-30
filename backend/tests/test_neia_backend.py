"""Backend API tests for Néia Salgados."""
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://neia-salgados-app.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def products(s):
    r = s.get(f"{API}/products")
    assert r.status_code == 200
    return r.json()


# ============ PRODUCTS ============
class TestProducts:
    def test_list_all_products_returns_six(self, s):
        r = s.get(f"{API}/products")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 6, f"Expected 6 seeded products, got {len(data)}"
        # verify all 3 categories present
        cats = {p["category"] for p in data}
        assert {"combo", "frito", "congelado"}.issubset(cats)

    def test_filter_by_combo(self, s):
        r = s.get(f"{API}/products", params={"category": "combo"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert all(p["category"] == "combo" for p in data)

    def test_filter_by_frito(self, s):
        r = s.get(f"{API}/products", params={"category": "frito"})
        assert r.status_code == 200
        assert all(p["category"] == "frito" for p in r.json())

    def test_filter_by_congelado(self, s):
        r = s.get(f"{API}/products", params={"category": "congelado"})
        assert r.status_code == 200
        assert all(p["category"] == "congelado" for p in r.json())

    def test_get_product_by_id(self, s, products):
        pid = products[0]["id"]
        r = s.get(f"{API}/products/{pid}")
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_get_product_404(self, s):
        r = s.get(f"{API}/products/nonexistent-id")
        assert r.status_code == 404


# ============ ORDERS ============
def _make_item(prod, qty):
    return {
        "product_id": prod["id"],
        "product_name": prod["name"],
        "category": prod["category"],
        "quantity": qty,
        "unit_price": prod["price"],
        "subtotal": round(prod["price"] * (qty / prod["unit_size"] if prod["category"] != "congelado" else qty), 2),
        "flavors": {},
    }


def _make_payload(items, coupon=None):
    return {
        "customer": {"name": "TEST_Cliente", "phone": "11988887777", "address": "Rua X, 100", "complement": ""},
        "items": items,
        "payment_method": "pix",
        "coupon_code": coupon,
        "notes": "",
    }


class TestOrders:
    def test_create_order_combo_valid_multiple_50(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        payload = _make_payload([_make_item(combo, 50)])
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["subtotal"] > 0
        assert data["delivery_fee"] == 8.0
        assert data["total"] == round(data["subtotal"] + 8.0 - data["discount"], 2)
        assert data["status"] == "recebido"
        # Verify persistence via GET
        r2 = s.get(f"{API}/orders/{data['id']}")
        assert r2.status_code == 200
        assert r2.json()["id"] == data["id"]

    def test_create_order_combo_not_multiple_50_returns_400(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        payload = _make_payload([_make_item(combo, 30)])
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 400

    def test_create_order_frito_not_multiple_50_returns_400(self, s, products):
        frito = next(p for p in products if p["category"] == "frito")
        payload = _make_payload([_make_item(frito, 25)])
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 400

    def test_create_order_congelado_min_1(self, s, products):
        cong = next(p for p in products if p["category"] == "congelado")
        payload = _make_payload([_make_item(cong, 1)])
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 200
        assert r.json()["items"][0]["quantity"] == 1

    def test_create_order_congelado_zero_returns_400(self, s, products):
        cong = next(p for p in products if p["category"] == "congelado")
        payload = _make_payload([_make_item(cong, 0)])
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 400

    def test_coupon_neia10_applies_10_percent(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        payload = _make_payload([_make_item(combo, 50)], coupon="NEIA10")
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        expected_discount = round(data["subtotal"] * 0.10, 2)
        assert abs(data["discount"] - expected_discount) < 0.01
        assert data["coupon_code"] == "NEIA10"

    def test_coupon_invalid_returns_400(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        payload = _make_payload([_make_item(combo, 50)], coupon="INVALIDO")
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 400

    def test_get_order_404(self, s):
        r = s.get(f"{API}/orders/no-such-order")
        assert r.status_code == 404

    def test_list_orders_by_phone(self, s):
        r = s.get(f"{API}/orders", params={"phone": "11988887777"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert all(o["customer"]["phone"] == "11988887777" for o in data)


# ============ MOTOBOY ============
class TestMotoboy:
    def test_motoboy_login_success(self, s):
        r = s.post(f"{API}/motoboy/login", json={"phone": "11999990001", "password": "1234"})
        assert r.status_code == 200
        data = r.json()
        assert data["phone"] == "11999990001"
        assert "id" in data
        assert "password" not in data

    def test_motoboy_login_wrong_password_401(self, s):
        r = s.post(f"{API}/motoboy/login", json={"phone": "11999990001", "password": "wrong"})
        assert r.status_code == 401

    def test_motoboy_location_update(self, s):
        login = s.post(f"{API}/motoboy/login", json={"phone": "11999990001", "password": "1234"}).json()
        r = s.post(f"{API}/motoboy/{login['id']}/location", json={"lat": -23.55, "lng": -46.63})
        assert r.status_code == 200
        assert r.json()["lat"] == -23.55

    def test_motoboy_location_404(self, s):
        r = s.post(f"{API}/motoboy/fake-id/location", json={"lat": 0, "lng": 0})
        assert r.status_code == 404

    def test_start_delivery_flow(self, s, products):
        # create order
        combo = next(p for p in products if p["category"] == "combo")
        order = s.post(f"{API}/orders", json=_make_payload([_make_item(combo, 50)])).json()
        # login motoboy
        m = s.post(f"{API}/motoboy/login", json={"phone": "11999990001", "password": "1234"}).json()
        # admin assign
        s.post(f"{API}/admin/orders/{order['id']}/assign", json={"motoboy_id": m["id"]})
        # start delivery
        r = s.post(f"{API}/motoboy/{m['id']}/start-delivery/{order['id']}")
        assert r.status_code == 200
        # verify status
        verify = s.get(f"{API}/orders/{order['id']}").json()
        assert verify["status"] == "saiu_entrega"


# ============ ADMIN ============
class TestAdmin:
    def test_admin_login_success(self, s):
        r = s.post(f"{API}/admin/login", json={"password": "neia2026"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_admin_login_wrong_password_401(self, s):
        r = s.post(f"{API}/admin/login", json={"password": "wrong"})
        assert r.status_code == 401

    def test_admin_list_orders(self, s):
        r = s.get(f"{API}/admin/orders")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_update_status(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        order = s.post(f"{API}/orders", json=_make_payload([_make_item(combo, 50)])).json()
        r = s.patch(f"{API}/admin/orders/{order['id']}/status", json={"status": "fritando"})
        assert r.status_code == 200
        v = s.get(f"{API}/orders/{order['id']}").json()
        assert v["status"] == "fritando"

    def test_admin_assign_motoboy(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        order = s.post(f"{API}/orders", json=_make_payload([_make_item(combo, 50)])).json()
        motoboys = s.get(f"{API}/admin/motoboys").json()
        assert len(motoboys) >= 1
        r = s.post(f"{API}/admin/orders/{order['id']}/assign", json={"motoboy_id": motoboys[0]["id"]})
        assert r.status_code == 200
        assert r.json()["motoboy_name"] == motoboys[0]["name"]

    def test_admin_assign_bad_motoboy_404(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        order = s.post(f"{API}/orders", json=_make_payload([_make_item(combo, 50)])).json()
        r = s.post(f"{API}/admin/orders/{order['id']}/assign", json={"motoboy_id": "nope"})
        assert r.status_code == 404
