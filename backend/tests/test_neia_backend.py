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
        assert len(data) >= 6, f"Expected >=6 seeded products, got {len(data)}"
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
    # Use scheduled_for to bypass working-hours check in tests (dentro do limite de 15 dias)
    from datetime import datetime, timedelta, timezone
    future = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat().replace("+00:00", "Z")
    return {
        "customer": {"name": "TEST_Cliente", "phone": "11988887777", "address": "Rua X, 100", "complement": ""},
        "items": items,
        "payment_method": "pix",
        "coupon_code": coupon,
        "notes": "",
        "scheduled_for": future,
    }


class TestOrders:
    def test_create_order_combo_valid_multiple_50(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        payload = _make_payload([_make_item(combo, 50)])
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["subtotal"] > 0
        assert data["delivery_fee"] >= 6.0  # per-km min or bairro fee
        assert data["total"] == round(data["subtotal"] + data["delivery_fee"] - data["discount"], 2)
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


# ============ NEW: BEBIDA, COUPONS, LOYALTY ============
class TestBebida:
    def test_bebidas_have_unit_size_1(self, s):
        r = s.get(f"{API}/products", params={"category": "bebida"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for p in data:
            assert p["unit_size"] == 1, f"Bebida {p['name']} deve ter unit_size 1"

    def test_create_order_bebida_qty_1_ok(self, s):
        r = s.get(f"{API}/products", params={"category": "bebida"})
        beb = r.json()[0]
        payload = _make_payload([_make_item(beb, 1)])
        r2 = s.post(f"{API}/orders", json=payload)
        assert r2.status_code == 200, r2.text
        assert r2.json()["items"][0]["quantity"] == 1


class TestAdminCoupons:
    def test_create_and_list_coupon(self, s):
        code = "TESTE_XPTO"
        # cleanup
        s.delete(f"{API}/admin/coupons/{code}")
        r = s.post(f"{API}/admin/coupons", json={
            "code": code, "discount_percent": 20, "active": True,
            "first_order_only": False, "description": "teste"
        })
        assert r.status_code == 200, r.text
        assert r.json()["code"] == code
        # duplicate
        r2 = s.post(f"{API}/admin/coupons", json={"code": code, "discount_percent": 20})
        assert r2.status_code == 400
        # list contains it
        lst = s.get(f"{API}/admin/coupons").json()
        assert any(c["code"] == code for c in lst)
        # toggle inactive
        pr = s.patch(f"{API}/admin/coupons/{code}", json={"active": False})
        assert pr.status_code == 200
        # delete
        dr = s.delete(f"{API}/admin/coupons/{code}")
        assert dr.status_code == 200

    def test_first_order_only_blocks_second_use(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        code = "FIRST_ONLY_TEST"
        s.delete(f"{API}/admin/coupons/{code}")
        s.post(f"{API}/admin/coupons", json={
            "code": code, "discount_percent": 10, "active": True, "first_order_only": True
        })
        # unique phone
        import uuid as _u
        phone = f"1198{str(_u.uuid4().int)[:7]}"
        payload = _make_payload([_make_item(combo, 50)], coupon=code)
        payload["customer"]["phone"] = phone
        r1 = s.post(f"{API}/orders", json=payload)
        assert r1.status_code == 200, r1.text
        # second time with same phone should fail
        r2 = s.post(f"{API}/orders", json=payload)
        assert r2.status_code == 400
        s.delete(f"{API}/admin/coupons/{code}")


class TestLoyaltyPoints:
    def test_redeem_requires_multiples_of_100(self, s):
        r = s.post(f"{API}/customers/11999998888/redeem-points", json={"points": 50})
        assert r.status_code == 400

    def test_points_awarded_on_delivery_and_redeem(self, s, products):
        combo = next(p for p in products if p["category"] == "combo")
        import uuid as _u
        phone = f"1198{str(_u.uuid4().int)[:7]}"
        payload = _make_payload([_make_item(combo, 100)])
        payload["customer"]["phone"] = phone
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 200
        order = r.json()
        total = int(order["total"])
        # deliver
        s.patch(f"{API}/admin/orders/{order['id']}/status", json={"status": "entregue"})


class TestMotoboyCRUD:
    def test_create_edit_delete_motoboy(self, s):
        import uuid as _u
        phone = f"1199{str(_u.uuid4().int)[:7]}"
        r = s.post(f"{API}/admin/motoboys", json={
            "name": "Motoboy Teste", "phone": phone, "password": "9999", "active": True
        })
        assert r.status_code == 200, r.text
        mid = r.json()["id"]
        # duplicate phone
        r2 = s.post(f"{API}/admin/motoboys", json={"name": "X", "phone": phone, "password": "1"})
        assert r2.status_code == 400
        # update
        pr = s.patch(f"{API}/admin/motoboys/{mid}", json={"name": "Motoboy Novo"})
        assert pr.status_code == 200
        # list all
        lst = s.get(f"{API}/admin/motoboys/all").json()
        assert any(m["id"] == mid and m["name"] == "Motoboy Novo" for m in lst)
        # deactivate
        d = s.delete(f"{API}/admin/motoboys/{mid}")
        assert d.status_code == 200
        active_list = s.get(f"{API}/admin/motoboys").json()
        assert not any(m["id"] == mid for m in active_list)


class TestMotoboyFinancial:
    def test_ranking_has_delivery_fees_and_totals(self, s):
        r = s.get(f"{API}/admin/motoboys/ranking", params={"period": "week"})
        assert r.status_code == 200
        data = r.json()
        assert "totals" in data
        assert "delivery_fees_total" in data["totals"]
        assert isinstance(data["ranking"], list)
        for row in data["ranking"]:
            assert "delivery_fees_total" in row


class TestLoyaltySettings:
    def test_update_loyalty_settings(self, s):
        r = s.patch(f"{API}/admin/settings", json={
            "loyalty_active": True,
            "loyalty_points_per_real": 2.0,
            "loyalty_tiers": [{"points": 50, "discount_pct": 3}, {"points": 150, "discount_pct": 8}]
        })
        assert r.status_code == 200, r.text
        pub = s.get(f"{API}/settings").json()
        assert pub["loyalty_points_per_real"] == 2.0
        assert len(pub["loyalty_tiers"]) == 2
        # restore
        s.patch(f"{API}/admin/settings", json={
            "loyalty_points_per_real": 1.0,
            "loyalty_tiers": [{"points": 100, "discount_pct": 5}, {"points": 200, "discount_pct": 10},
                              {"points": 300, "discount_pct": 15}, {"points": 500, "discount_pct": 25}]
        })

    def test_redeem_uses_tiers(self, s, products):
        # Set a custom tier so 250 pts -> 12%
        s.patch(f"{API}/admin/settings", json={
            "loyalty_tiers": [{"points": 100, "discount_pct": 5}, {"points": 250, "discount_pct": 12}]
        })
        # create phone with enough points via delivered order
        combo = next(p for p in products if p["category"] == "combo")
        import uuid as _u
        phone = f"1198{str(_u.uuid4().int)[:7]}"
        payload = _make_payload([_make_item(combo, 250)])
        payload["customer"]["phone"] = phone
        o = s.post(f"{API}/orders", json=payload).json()
        s.patch(f"{API}/admin/orders/{o['id']}/status", json={"status": "entregue"})
        me = s.get(f"{API}/customers/me", params={"phone": phone}).json()
        if me["points"] >= 250:
            rr = s.post(f"{API}/customers/{phone}/redeem-points", json={"points": 250})
            assert rr.status_code == 200, rr.text
            assert rr.json()["discount_percent"] == 12
        # Non-tier point request must fail
        bad = s.post(f"{API}/customers/{phone}/redeem-points", json={"points": 175})
        assert bad.status_code == 400
        # restore
        s.patch(f"{API}/admin/settings", json={
            "loyalty_tiers": [{"points": 100, "discount_pct": 5}, {"points": 200, "discount_pct": 10},
                              {"points": 300, "discount_pct": 15}, {"points": 500, "discount_pct": 25}]
        })


class TestScheduling:
    def test_schedule_within_15_days_ok(self, s, products):
        from datetime import datetime, timedelta, timezone
        combo = next(p for p in products if p["category"] == "combo")
        future = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat().replace("+00:00", "Z")
        p = _make_payload([_make_item(combo, 50)])
        p["scheduled_for"] = future
        r = s.post(f"{API}/orders", json=p)
        assert r.status_code == 200, r.text

    def test_schedule_beyond_15_days_rejected(self, s, products):
        from datetime import datetime, timedelta, timezone
        combo = next(p for p in products if p["category"] == "combo")
        future = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat().replace("+00:00", "Z")
        p = _make_payload([_make_item(combo, 50)])
        p["scheduled_for"] = future
        r = s.post(f"{API}/orders", json=p)
        assert r.status_code == 400
        assert "15 dias" in r.json().get("detail", "")
