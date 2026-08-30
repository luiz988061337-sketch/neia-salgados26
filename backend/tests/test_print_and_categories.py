"""Backend API tests for new print-templates, printers, receipt and mini-* product categories."""
import os
from datetime import datetime, timezone, timedelta
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://neia-salgados-app.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ============ PRODUCTS — Mini subcategories & bebida ============
class TestProductCategoriesFull:
    def test_seed_has_all_9_categories(self, s):
        """Verifica que o seed cria produtos em todas as 9 categorias/subcategorias."""
        r = s.get(f"{API}/products")
        assert r.status_code == 200
        prods = r.json()
        # 4 main categories
        cats = {p["category"] for p in prods}
        assert {"combo", "frito", "congelado", "bebida"}.issubset(cats), f"Faltando categorias: {cats}"
        # 5 mini subcategories under frito
        subs = {p.get("subcategory") for p in prods if p.get("subcategory")}
        expected_subs = {"mini-fritos", "mini-assados", "mini-pastelzinho", "mini-pizza", "mini-empada"}
        assert expected_subs.issubset(subs), f"Subcategorias mini-* faltando: {expected_subs - subs}"

    def test_filter_by_subcategory_mini_pizza(self, s):
        r = s.get(f"{API}/products", params={"category": "frito", "subcategory": "mini-pizza"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for p in data:
            assert p["category"] == "frito"
            assert p["subcategory"] == "mini-pizza"

    def test_create_product_with_mini_pizza(self, s):
        """POST admin cria produto com category=frito, subcategory=mini-pizza."""
        payload = {
            "name": "TEST_MiniPizza_Auto",
            "description": "Teste automatizado",
            "category": "frito",
            "subcategory": "mini-pizza",
            "price": 3.5,
            "unit_size": 50,
            "image_url": "",
            "flavors": [],
        }
        r = s.post(f"{API}/admin/products", json=payload)
        assert r.status_code in (200, 201), f"Erro: {r.status_code} {r.text}"
        created = r.json()
        assert created["category"] == "frito"
        assert created["subcategory"] == "mini-pizza"
        pid = created["id"]

        # Verify GET
        r2 = s.get(f"{API}/products/{pid}")
        assert r2.status_code == 200
        got = r2.json()
        assert got["subcategory"] == "mini-pizza"

        # Cleanup
        s.delete(f"{API}/admin/products/{pid}")

    def test_create_product_bebida(self, s):
        payload = {"name": "TEST_Bebida_Auto", "description": "x", "category": "bebida",
                   "price": 5.0, "unit_size": 1, "image_url": "", "flavors": []}
        r = s.post(f"{API}/admin/products", json=payload)
        assert r.status_code in (200, 201)
        pid = r.json()["id"]
        assert r.json()["category"] == "bebida"
        s.delete(f"{API}/admin/products/{pid}")


# ============ PRINT TEMPLATES ============
class TestPrintTemplates:
    def test_list_has_default_seeded(self, s):
        r = s.get(f"{API}/admin/print-templates")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 2, f"Esperava >=2 templates seedados, tem {len(data)}"
        widths = {int(t.get("width_mm", 0)) for t in data}
        assert 80 in widths, "Falta template 80mm"
        assert 58 in widths, "Falta template 58mm"

    def test_create_edit_delete_template(self, s):
        payload = {
            "name": "TEST_Modelo_80",
            "width_mm": 80,
            "header": "*** TESTE ***\n",
            "body_template": "Pedido {short_code}\nCliente {customer_name}\nTotal R$ {total}\n",
            "footer": "Obrigado!\n",
            "active": True,
        }
        r = s.post(f"{API}/admin/print-templates", json=payload)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        created = r.json()
        assert "id" in created
        tid = created["id"]
        assert created["name"] == "TEST_Modelo_80"
        assert created["width_mm"] == 80

        # PATCH
        r2 = s.patch(f"{API}/admin/print-templates/{tid}", json={"name": "TEST_Modelo_80_Renamed"})
        assert r2.status_code == 200

        # Verify by list
        r3 = s.get(f"{API}/admin/print-templates")
        found = next((t for t in r3.json() if t["id"] == tid), None)
        assert found is not None
        assert found["name"] == "TEST_Modelo_80_Renamed"

        # DELETE
        r4 = s.delete(f"{API}/admin/print-templates/{tid}")
        assert r4.status_code == 200

        r5 = s.get(f"{API}/admin/print-templates")
        assert not any(t["id"] == tid for t in r5.json())

    def test_patch_nonexistent_returns_404(self, s):
        r = s.patch(f"{API}/admin/print-templates/nonexistent-id", json={"name": "x"})
        assert r.status_code == 404


# ============ PRINTERS ============
class TestPrinters:
    def test_list_has_default_seeded(self, s):
        r = s.get(f"{API}/admin/printers")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Esperava >=1 impressora"

    def test_create_default_unmarks_others(self, s):
        # cria impressora nova como default
        payload = {"name": "TEST_Impressora_Auto", "model": "TestModel",
                   "width_mm": 80, "is_default": True, "active": True}
        r = s.post(f"{API}/admin/printers", json=payload)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        new_p = r.json()
        pid = new_p["id"]
        assert new_p["is_default"] is True

        # confirma que outras não são default
        all_printers = s.get(f"{API}/admin/printers").json()
        defaults = [p for p in all_printers if p.get("is_default")]
        assert len(defaults) == 1, f"Deveria ter só 1 default, tem {len(defaults)}"
        assert defaults[0]["id"] == pid

        # PATCH: rename
        r2 = s.patch(f"{API}/admin/printers/{pid}", json={"name": "TEST_Renamed"})
        assert r2.status_code == 200

        # DELETE
        r3 = s.delete(f"{API}/admin/printers/{pid}")
        assert r3.status_code == 200

    def test_delete_nonexistent_returns_404(self, s):
        r = s.delete(f"{API}/admin/printers/nonexistent-id")
        assert r.status_code == 404


# ============ RECEIPT RENDERING ============
class TestReceipt:
    def _create_order(self, s):
        # Pega qualquer produto bebida (unit_size=1) para criar pedido simples
        prods = s.get(f"{API}/products").json()
        bebida = next((p for p in prods if p["category"] == "bebida"), None)
        assert bebida is not None, "Precisa de um produto bebida seedado"
        payload = {
            "customer": {
                "name": "TEST_ReceiptCustomer",
                "phone": "11955550000",
                "address": "Rua de Teste, 123",
                "complement": "Apto 1",
                "whatsapp_opt_in": False,
            },
            "items": [{
                "product_id": bebida["id"], "product_name": bebida["name"],
                "category": "bebida", "quantity": 2,
                "unit_price": bebida["price"],
                "subtotal": round(bebida["price"] * 2, 2),
                "flavors": {},
            }],
            "payment_method": "pix",
            "scheduled_for": (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),
        }
        r = s.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, f"Falha ao criar pedido: {r.status_code} {r.text}"
        return r.json()

    def test_receipt_renders_placeholders(self, s):
        order = self._create_order(s)
        r = s.get(f"{API}/admin/orders/{order['id']}/receipt")
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert "text" in data and isinstance(data["text"], str)
        assert "width_mm" in data
        assert data["width_mm"] in (58, 80)
        assert "printer" in data
        assert "template" in data
        text = data["text"]
        # placeholders devem estar substituídos
        assert order["short_code"] in text, f"short_code não foi substituído. Texto:\n{text}"
        assert "TEST_ReceiptCustomer" in text, "customer_name não foi substituído"
        assert f"{order['total']:.2f}" in text, "total não foi substituído"
        # não deve haver placeholders brutos
        assert "{short_code}" not in text
        assert "{customer_name}" not in text
        assert "{total}" not in text

    def test_receipt_nonexistent_order_404(self, s):
        r = s.get(f"{API}/admin/orders/does-not-exist/receipt")
        assert r.status_code == 404
