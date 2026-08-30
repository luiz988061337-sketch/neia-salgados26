# Néia Salgados — PRD

## Última entrega — Fidelidade, Cupons Avançados, Compartilhamento, Bebidas & Avaliação

### 1. Programa de Fidelidade (pontos)
- Cliente ganha **1 ponto por R$1 gasto** ao pedido ser marcado como *entregue* (automático).
- Cartão "Programa Fidelidade" no Perfil mostra saldo, barra de progresso e botões de resgate.
- Resgates: 100 pts → 5% off, 200 pts → 10% off, 500 pts → 25% off (teto). Cupom pessoal gerado com uso único.
- Endpoint: `POST /api/customers/{phone}/redeem-points`.
- Notificação in-app "🏆 +N pontos!" ao entregar.

### 2. Cupons Promocionais Avançados
- Novo painel Admin **Cupons Promocionais** (`/staff/coupons`) com CRUD completo.
- Suporte a: `discount_percent`, `active`, `expires_at`, `max_uses` + `uses_count`, `first_order_only`, `description`.
- Backend valida na criação de pedido: expirado / esgotado / não é 1ª compra / cupom pessoal (`belongs_to`).
- Cupom **BEMVINDO** (15% off) é aplicado automaticamente na 1ª compra se cliente não informar código.
- Endpoints admin: `GET/POST/PATCH/DELETE /api/admin/coupons[/{code}]`.

### 3. Compartilhamento de Pedido (Tracking)
- Bloco de share reformulado com 3 botões: WhatsApp (pré-preenchido) + Share nativo + Copiar link `/order/{id}`.

### 4. Avaliação com estrelas (visível no Tracking)
- Bloco "Avalie seu pedido" com 5 estrelas quando status = entregue (ou já avaliado).
- Persistido em `POST /api/orders/{id}/rating`.

### 5. Bebidas a partir de 1 unidade
- Categoria `bebida` com `unit_size: 1` no seed (Coca 2L, Guaraná 2L, Coca lata, Suco 1L, Água 500ml).
- UI de produto: mostra "A partir de 1un" e stepper de 1 em 1 para bebidas.
- Frase "Monte seu combo frito" → "Monte seu Combo" no home e build-combo.

## Feature anterior: Monte seu Combo + Referral + Rating

### 1. Monte seu Combo
- Nova rota `/build-combo` acessível pelo card destacado na Home
- Cliente escolhe quantidade total (múltiplos de 50) + distribui pelos sabores fritos disponíveis
- Botão "Distribuir igualmente" preenche automaticamente
- Preço somado a partir do preço unitário real de cada frito
- Adiciona no carrinho como um único item "Combo Personalizado Nun — Sabor A + Sabor B" com validação 50-em-50

### 2. Cupom por Indicação
- Cada cliente ganha um `referral_code` único no formato `AMIGO-XXXX` (últimos 4 dígitos do telefone)
- Novo cliente coloca o código no checkout → ganha 10% off no 1º pedido
- Quem indicou ganha automaticamente um cupom pessoal `AMIGO{XXXX}-{YYYY}` (10% off) + notificação in-app
- Backend valida: 
  - Cliente indicado precisa ser diferente do dono
  - Só vale para o primeiro pedido do amigo (previne fraude)
- Endpoint `GET /api/customers/me?phone=X` retorna o código, quantos amigos usaram e os créditos disponíveis

### 3. Avaliação de Pedido
- Endpoint `POST /api/orders/{id}/rating` com {stars 1-5, comment}
- Order guarda `rating_stars`, `rating_comment`, `rated_at`

## Todas as features
Cliente: home com bell, hero, "Monte seu Combo", destaques (fotos em rodízio), combos, cardápio filtrado, combo builder tradicional, cart com bulk banner, checkout completo (mapa, agendamento, aniversário, referral), tracking com timeline + mapa + chat, notificações in-app.

Motoboy: login, entregas, GPS, chat.

Admin (senha `neia2026`): pedidos + WhatsApp, Configurações: Loja & Taxa por km, **Análise de Vendas**, Ranking de Motoboys, **Clientes VIP**, Aniversariantes, Cardápio & Fotos (rodízio), Bairros (legado), Cardápio de Feriado.

## Testes
- 26/26 backend pytests passando
- Fluxos validados via curl: referral (referrer + amigo + cupom pessoal), rating, monte seu combo (frontend-only)
