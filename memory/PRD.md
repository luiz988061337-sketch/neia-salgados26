# Néia Salgados — PRD

## Visão
App mobile completo (Expo) para operação da Néia Salgados: catálogo, pedidos, entrega em tempo real, motoboys, admin, analytics.

## Últimas 3 features

### 1. Análise de Vendas (Analytics)
- Configurações → **Análise de Vendas** com filtro Hoje / Semana / Mês
- KPIs: faturamento, nº pedidos, ticket médio
- Gráfico de barras por dia (bar chart em RN puro)
- Top 5 produtos por receita
- Endpoint `GET /api/admin/analytics?period=today|week|month` com aggregation MongoDB

### 2. Notificações no App (Bell)
- Ícone 🔔 no header da Home com badge de não lidas
- Sheet com histórico de todas as notificações do cliente
- Toque em notificação → abre tracking do pedido, marca como lida
- Backend cria notificação automaticamente a cada mudança de status
- Endpoints:
  - `GET /api/notifications?phone=X`
  - `POST /api/notifications/read-all?phone=X`
- Coleção `db.notifications`

### 3. Fotos em Rodízio
- Produto agora tem `image_urls: List[str]` (galeria) além do `image_url` (capa)
- Componente `RotatingImage` faz troca automática a cada 2.6s com transição fade
- Home (destaques + combos) e Cardápio usam RotatingImage
- Admin → Cardápio & Fotos → editar produto → nova seção "Fotos em rodízio" com carrossel horizontal + botão "Adicionar" e lixeira por foto

## Todas as features do app (recap)

### Cliente
- Home com hero, banner "Loja fechada"/temas, destaques com fotos rotativas, bell de notificações
- Cardápio com filtros e RotatingImage
- Combo builder 50-em-50, card "Que tal misturar sabores?"
- Carrinho com banner de tier de encomenda em massa
- Checkout: dados, endereço, mapa arrastável, agendamento, aniversário (cupom auto), pagamento
- Tracking timeline + mapa GPS + chat com motoboy
- Notificações in-app (sino)

### Motoboy
- Login, entregas atribuídas, GPS, chat por pedido

### Admin
- Painel de pedidos com filtros, distância, agendamento, WhatsApp
- Configurações completas (8 telas):
  1. Loja & Taxa por km
  2. **Análise de Vendas (novo)**
  3. Ranking de Motoboys
  4. Clientes VIP
  5. Aniversariantes de Hoje
  6. Cardápio & Fotos (com **rodízio de fotos**)
  7. Bairros (legado)
  8. Cardápio de Feriado

## Testes
- 26/26 backend pytests passando
- Fluxos validados via curl (analytics, notifications, chat, ranking, bulk, birthdays)

## Notas
- Notificações são in-app (não push). Push nativa seria feature separada e só funciona em build nativo.
- Fotos em rodízio usam `expo-image` com transition para fade suave.
