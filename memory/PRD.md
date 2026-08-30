# Néia Salgados — PRD

## Visão
App mobile (Expo) para clientes fazerem pedidos de salgados da Néia (combos, fritos 50-em-50 e congelados), com rastreamento de motoboys em tempo real e painel admin.

## Funcionalidades entregues (MVP)

### Cliente (sem login)
- Home com destaques, hero e combos
- Cardápio com filtros: Tudo / Combos / Fritos / Congelados
- Detalhe do produto:
  - Stepper de quantidade em múltiplos de 50 para combos/fritos
  - Congelados a partir de 1 unidade
  - Seletor de sabores com validação (soma == quantidade)
- Carrinho persistente (AsyncStorage) com resumo, taxa e cupom
- Checkout guest (nome, telefone, endereço, complemento)
- Pagamento: Pix, Dinheiro (com troco) ou Cartão na entrega
- Cupom validado no backend (NEIA10 = 10%, PRIMEIRO = 15%)
- Meus Pedidos (busca por telefone) + tracking do pedido:
  - Timeline: Recebido → Fritando → Saiu para entrega → Entregue
  - Mapa com posição do motoboy quando "saiu para entrega" (react-native-maps no nativo, fallback textual na web)

### Motoboy
- Login por telefone + senha
- Lista de entregas atribuídas
- Botão "Iniciar entrega" (pede permissão de GPS)
- Envio automático da localização a cada 8s (expo-location)
- Botão "Marcar como entregue"

### Admin
- Login por senha (env `ADMIN_PASSWORD=neia2026`)
- Painel com filtros por status
- Alterar status do pedido
- Atribuir/trocar motoboy

## Stack
- **Frontend**: Expo SDK 54, expo-router, react-native-maps, expo-location, @gorhom/bottom-sheet, phosphor-react-native, expo-image, expo-linear-gradient
- **Backend**: FastAPI + Motor (MongoDB async), rotas com prefixo `/api`
- **Storage**: MongoDB (products, orders, motoboys, coupons)

## Endpoints principais
- `GET /api/products?category=` — catálogo
- `POST /api/orders` — criar pedido (valida múltiplos de 50)
- `GET /api/orders/{id}` — detalhe + `motoboy_location`
- `GET /api/orders?phone=` — pedidos do cliente
- `POST /api/motoboy/login` — login motoboy
- `POST /api/motoboy/{id}/location` — atualizar GPS
- `POST /api/motoboy/{id}/start-delivery/{order_id}` — sair para entrega
- `POST /api/motoboy/{id}/complete/{order_id}` — marcar entregue
- `POST /api/admin/login` — autenticar admin
- `PATCH /api/admin/orders/{id}/status` — alterar status
- `POST /api/admin/orders/{id}/assign` — atribuir motoboy

## Seeds
- 6 produtos (2 combos, 2 fritos, 2 congelados)
- 2 motoboys de demo (11999990001 e 11999990002, senha 1234)
- 2 cupons (NEIA10, PRIMEIRO)

## Testes
- 26/26 backend pytests passando
- Frontend validado visualmente (home, cardápio, detalhe de produto com stepper 50-em-50)

## Notas
- Mapa só funciona no build nativo/Expo Go; no preview web mostra fallback textual (o app é mobile).
- Rastreamento em tempo real usa polling a cada 5s no cliente e envio a cada 8s pelo motoboy.
