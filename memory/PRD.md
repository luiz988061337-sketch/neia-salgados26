# Néia Salgados — PRD

## Última entrega — Rota no motoboy + Link ao cliente

### 1. Botão "Abrir rota no maps" no motoboy
- Cada card de pedido na tela `/staff/motoboy` agora tem 2 formas de abrir a rota:
  - Ícone circular verde (NavigationArrow) ao lado do botão de chat
  - Botão pill amplo "Abrir rota no maps" abaixo dos CTAs
- Deep-link nativo:
  - iOS: `maps://?daddr=lat,lng&dirflg=d` (Apple Maps)
  - Android: `google.navigation:q=lat,lng&mode=d` (Google Maps navegação)
  - Fallback web: `https://www.google.com/maps/dir/...`
- Se o pedido não tiver GPS (`delivery_lat`/`delivery_lng`), usa busca por endereço.
- Funciona **sem** precisar de Twilio.

### 2. Link de acompanhamento para o cliente
- Quando o motoboy toca "Iniciar entrega" (`POST /motoboy/{id}/start-delivery/{order_id}`), o backend:
  - Marca `status = saiu_entrega`
  - Cria notificação in-app "🛵 Pedido #XXXX a caminho"
  - Envia mensagem WhatsApp para o cliente com o link `/order/{id}` para tracking em tempo real
- Também acionado quando o admin muda o status para `saiu_entrega` via `PATCH /admin/orders/{id}/status`.
- Nova função `notify_customer_out_for_delivery` reutilizada em ambos os fluxos.
- Log registrado em `message_logs` com `kind: out_for_delivery`.

## Entrega anterior — Todas categorias no cadastro + Impressão de comandas

### 1. Bug fix — Todas categorias no cadastro
- Botão "+" na tela `/staff/products` agora abre um modal vazio (não força criação com categoria "bebida" como antes).
- Seletor de categoria mostra as 9 opções do cardápio: 🎉 Combos, 🍗 Fritos, ❄️ Congelados, 🥤 Bebidas, 🥟 Mini Fritos, 🍞 Mini Assados, 🥟 Mini Pastelzinho, 🍕 Mini Pizza, 🥧 Mini Empada.
- Cada mini-* mapeia para `category="frito"` + `subcategory` correspondente ao ser salvo.

### 2. Impressão de comandas
- Nova tela `/staff/print-templates`: CRUD de modelos com editor de cabeçalho/corpo/rodapé, largura 58 ou 80mm, placeholders {short_code}, {customer_name}, {items}, {total} etc.
- Nova tela `/staff/printers`: cadastrar impressoras (nome, modelo, template, largura, is_default, ativa).
- Backend seed cria automaticamente 2 modelos (80mm padrão + 58mm compacto) e 1 impressora "Impressora Balcão".
- Botão "Imprimir comanda" em cada card do admin kanban (`/staff/admin`) — abre diálogo de impressão nativo via `expo-print` (PDF → sistema).
- Endpoint `GET /api/admin/orders/{id}/receipt?printer_id=` retorna o texto renderizado + largura + template.

### 3. Testes
- 50/50 pytest passando (38 originais + 12 novos de impressão/categorias).

## Entrega anterior — Agendamento estendido

### Agendamento até 15 dias
- Cliente pode agendar entrega em qualquer dia até 15 dias no futuro (antes era ilimitado)
- `DateTimePicker` no checkout usa `maximumDate = hoje + 15 dias`
- Backend valida no `POST /orders`: bloqueia se `scheduled_for > agora + 15 dias` ou `< agora`
- Mensagem no checkout: "Toque para agendar até 15 dias no futuro"

## Entrega anterior — Motoboys, Financeiro, Fidelidade editável & Branding

### 1. Cadastro de Motoboys (Admin)
- Nova tela `/staff/motoboys-admin` com listagem, criação, edição e desativação.
- Endpoints: `GET /api/admin/motoboys/all`, `POST/PATCH/DELETE /api/admin/motoboys[/{id}]`.
- Valida telefone duplicado, senha obrigatória apenas na criação, toggle ativo/inativo.
- Motoboy inativo não consegue login.

### 2. Financeiro Motoboys (soma de taxa)
- Renomeada "Ranking" → **Financeiro Motoboys** (`/staff/ranking`).
- Tabs de período: Hoje / 7 dias / 30 dias.
- 3 KPIs: entregas, **taxa de entrega total** (destaque verde), faturado.
- Cada motoboy mostra soma de taxa de entrega, entregas, tempo médio.
- Endpoint `GET /admin/motoboys/ranking?period=today|week|month` retorna `delivery_fees_total` + `totals`.

### 3. Plano de Fidelidade editável
- Nova tela `/staff/loyalty` — Admin edita: ativar/desativar, pontos por R$1, tabela dinâmica de níveis (pontos → % off).
- Backend persiste em `settings`: `loyalty_active`, `loyalty_points_per_real`, `loyalty_tiers[]`.
- Perfil do cliente usa a tabela dinâmica (mostra progresso até o próximo nível).
- Ao entregar, sistema concede pontos usando o ratio configurado.
- Resgate valida se o valor de pontos está entre os tiers cadastrados.

### 4. Novo subtítulo da marca
- Home: **"O sabor que faz a diferença"** em itálico laranja abaixo de "Néia Salgados".
- Perfil: card da marca atualizado para o mesmo lema.

## Entrega anterior — Fidelidade, Cupons Avançados, Compartilhamento, Bebidas & Avaliação

### 1. Programa de Fidelidade (pontos)
- Cliente ganha pontos ao pedido ser entregue; cartão no Perfil com resgate por tiers.
- Endpoint: `POST /api/customers/{phone}/redeem-points`.

### 2. Cupons Promocionais Avançados
- Painel Admin **Cupons Promocionais** (`/staff/coupons`) com CRUD completo.
- Suporte a `first_order_only`, `max_uses`, `expires_at`.
- BEMVINDO auto-aplicado na 1ª compra.

### 3. Compartilhamento & Avaliação
- Tracking: WhatsApp + Share nativo + Copiar link.
- Avaliação com 5 estrelas quando entregue.

### 4. Bebidas
- Categoria `bebida` com `unit_size: 1` (Coca 2L, Guaraná 2L, etc).
- "Monte seu combo frito" → "Monte seu Combo".

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
