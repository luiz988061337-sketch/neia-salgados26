# Néia Salgados — PRD

## Última feature: Monte seu Combo + Referral + Rating

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
