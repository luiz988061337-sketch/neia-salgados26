# Néia Salgados — PRD

## Visão
App mobile (Expo) para clientes fazerem pedidos de salgados da Néia (combos, fritos 50-em-50, congelados), com rastreamento de motoboys em tempo real, painel admin completo e configurações operacionais.

## Funcionalidades entregues

### Cliente (sem login)
- Home com destaques, hero, combos e banners de tema ativo
- Cardápio com filtros: Tudo / Combos / Fritos / Congelados
- Combo builder com stepper 50 em 50 + seletor de sabores
- Congelados a partir de 1 unidade
- Carrinho persistente
- **Checkout com localização no mapa** (arrastar pino ou usar GPS) → distância em km e taxa calculadas automaticamente
- **Agendar entrega para data/hora futura** (opcional)
- Pagamento: Pix, Dinheiro (troco), Cartão na entrega
- Cupom validado (NEIA10, PRIMEIRO)
- Meus Pedidos + tracking com timeline + mapa GPS quando motoboy sai
- Compartilhar pedido no WhatsApp

### Motoboy
- Login por telefone + senha
- Lista de entregas atribuídas
- "Iniciar entrega" pede permissão GPS + envia posição a cada 8s
- "Marcar como entregue" registra `delivered_at`

### Admin (senha `neia2026`)
- Painel de pedidos com filtros por status
- Cada pedido mostra distância em km e badge de agendamento
- Alterar status → **abre WhatsApp automaticamente** com mensagem contextual (se aviso automático ligado)
- Botão manual "Avisar cliente pelo WhatsApp" em cada pedido
- Atribuir/trocar motoboy
- **Configurações → Loja & Taxa por km**:
  - Localização da loja (mapa)
  - Taxa base (até 3 km), taxa por km, mínimo, raio máximo
  - Toggle Aviso automático no WhatsApp
- **Configurações → Ranking Motoboys**: quem entregou mais rápido hoje (KPIs + medalhas 🥇🥈🥉 + tempo médio de entrega)
- Configurações → Cardápio & Fotos: editar produtos + upload de fotos reais (câmera/galeria via Object Storage)
- Configurações → Bairros (legado): CRUD de bairros com taxa própria (sobrepõe km quando definido)
- Configurações → Cardápio de Feriado: temas Copa / Festa Junina

## Integrações
- **Emergent Managed Object Storage** para upload de fotos
- **expo-location** para GPS
- **react-native-maps** com fallback web
- **expo-image-picker** para foto
- **@react-native-community/datetimepicker** para agendamento
- **Linking** para WhatsApp (wa.me)

## Endpoints
- `GET /api/settings` — store info + tarifas (público)
- `GET /api/admin/settings` + `PATCH /api/admin/settings` — atualizar loja e tarifas
- `POST /api/orders` — computa distância haversine, valida raio máximo, aplica taxa por km
- `PATCH /api/admin/orders/{id}/status` — marca `delivered_at` quando status vira entregue
- `GET /api/admin/motoboys/ranking?date=YYYY-MM-DD` — ranking por tempo médio de entrega
- (mantidos) products, orders, motoboys, coupons, neighborhoods, themes, upload

## Seeds
- 8 produtos (2 combos, 2 fritos, 2 congelados, 2 temáticos)
- 4 bairros legados
- 2 temas (Copa, Festa Junina)
- 2 motoboys
- 2 cupons
- Store default: São Paulo (Av. Paulista), taxa base R$ 6 (até 3 km), R$ 2/km adicional, raio 15 km

## Testes
- 26/26 backend pytests passando (fee agora aceita >=6)
- Distância + fee validados via curl (5 km → R$ 9,90 = 6 + 1,95×2)
- Ranking validado via curl (Carlos Silva 1 entrega 0.2min R$ 89,80)
- Object storage upload validado
- Frontend visualmente validado (checkout com mapa+agendamento, store settings, ranking)

## Notas
- Auto-WhatsApp: quando ligado, o WhatsApp abre no aparelho do admin imediatamente após mudança de status. Requer app do WhatsApp instalado.
- Map picker: precisa Expo Go / build nativo (web mostra card fallback com botão GPS).
