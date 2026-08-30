# Néia Salgados — PRD

## Visão
App mobile completo (Expo) para pedidos, entrega em tempo real, e operação da Néia Salgados.

## Últimas 3 features

### 1. Modo Encomenda em Massa (Preços Progressivos)
- Settings agora tem `bulk_tiers` com 4 níveis padrão:
  - 100+ salgados: 5% off (Encomenda)
  - 200+: 8% off (Encomenda Grande)
  - 500+: 12% off (Encomenda em Massa)
  - 1000+: 18% off (Encomenda Master)
- Backend aplica automaticamente o maior desconto entre cupom e bulk
- Carrinho mostra card destacando o tier ativo e quantos salgados faltam para o próximo
- Testado: 500 salgados → 12% off, R$96 economizados

### 2. Ranking de Clientes (Clientes VIP)
- Nova tela **Configurações → Clientes VIP**
- KPIs: total de clientes + faturamento total
- Ordena por gasto total (medalhas 🥇🥈🥉)
- Cada linha: nome, telefone, pedidos, valor total, aniversário (se cadastrado)
- Botão **Mimo** por cliente: abre WhatsApp com mensagem VIP pronta ("Você é cliente VIP... use VIP15 e ganhe 15% off!")
- Endpoint `GET /api/admin/customers/ranking` com aggregation MongoDB

### 3. Chat com Motoboy
- Coleção `db.chat_messages` com {order_id, from_role, text, created_at}
- Endpoints:
  - `GET /api/orders/{id}/messages?since=…`
  - `POST /api/orders/{id}/messages`
- ChatSheet component (reutilizável) com polling a cada 3.5s
- **Cliente**: botão de chat 💬 aparece no card do motoboy na tela de tracking quando pedido "saiu para entrega"
- **Motoboy**: botão de chat 💬 em cada card de pedido atribuído
- Bubbles no estilo WhatsApp (minhas = brand, delas = surface secondary)

## Todas as features do app

### Cliente
- Home com hero, destaques, combos e banners de tema ativo + banner "Loja fechada" quando fora do horário
- Cardápio filtrado (Tudo/Combos/Fritos/Congelados)
- Combo builder 50-em-50 com card sugestivo "Que tal misturar sabores?"
- Congelados a partir de 1 unidade
- Carrinho com **banner de tier de encomenda em massa**
- Checkout: dados + endereço + mapa arrastável + agendamento + aniversário + cupom + pagamento
- Tracking com timeline + mapa GPS motoboy + **chat com o motoboy**
- Compartilhar pedido no WhatsApp

### Motoboy
- Login por telefone/senha
- Lista de entregas atribuídas com **chat por pedido**
- GPS em tempo real (a cada 8s)
- Iniciar/completar entrega

### Admin (senha `neia2026`)
- Painel de pedidos com filtros, distância, badge de agendamento
- Mudança de status → aviso via Twilio (se configurado) ou wa.me
- Configurações completas:
  1. Loja & Taxa por km (localização, taxa, horário, aviso automático, cupom aniversário, Twilio)
  2. Ranking de Motoboys (medalhas)
  3. **Clientes VIP** (medalhas + Mimo)
  4. Aniversariantes de Hoje (envio em massa)
  5. Cardápio & Fotos (upload real)
  6. Bairros (legado)
  7. Cardápio de Feriado (temas)

## Integrações
- Emergent Managed Object Storage (fotos)
- Twilio WhatsApp API (opcional — placeholders em .env)
- expo-location, react-native-maps, expo-image-picker, @react-native-community/datetimepicker
- Linking.openURL (wa.me fallback)

## Testes
- 26/26 backend pytests passando
- Fluxos validados via curl:
  - Bulk 500 units → 12% off aplicado (R$96 discount)
  - Customer ranking retorna aggregation OK
  - Chat post + list funciona
  - Todos os endpoints anteriores continuam ok

## Notas
- Chat usa polling; suficiente para escala pequena/média. WebSocket seria melhor para produção massiva.
- Ranking de clientes ordena por total gasto (LTV) — melhor métrica para VIP.
