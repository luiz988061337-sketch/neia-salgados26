# Néia Salgados — PRD

## Visão
App mobile (Expo) para clientes fazerem pedidos de salgados da Néia (combos, fritos 50-em-50, congelados), com rastreamento de motoboys em tempo real e painel admin completo.

## Funcionalidades entregues

### Cliente (sem login)
- Home com destaques, hero, combos e **banners de tema ativo**
- Cardápio com filtros: Tudo / Combos / Fritos / Congelados
- Combo builder com stepper 50 em 50 + seletor de sabores
- Congelados a partir de 1 unidade
- Carrinho persistente (AsyncStorage)
- **Checkout com seletor de bairro** (cada bairro tem sua taxa própria)
- Pagamento: Pix, Dinheiro (troco), Cartão na entrega
- Cupom validado (NEIA10 10%, PRIMEIRO 15%)
- Meus Pedidos (busca por telefone)
- Tracking com timeline + mapa GPS quando motoboy sai
- **Compartilhar pedido no WhatsApp** direto do tracking

### Motoboy
- Login por telefone + senha
- Lista de entregas atribuídas
- "Iniciar entrega" pede permissão GPS + envia posição a cada 8s
- "Marcar como entregue"

### Admin (senha `neia2026`)
- **Painel de pedidos** com filtros por status
- Alterar status
- Atribuir/trocar motoboy
- **Botão "Avisar cliente pelo WhatsApp"** por pedido — abre wa.me com mensagem contextual e link do tracking
- **Configurações → Cardápio & Fotos**: editar produto, tirar foto (câmera) ou escolher da galeria (Emergent Object Storage), setar tema, marcar como destaque
- **Configurações → Bairros**: CRUD de bairros com taxa por bairro
- **Configurações → Cardápio de Feriado**: toggle liga/desliga temas (Copa, Festa Junina, etc). Produtos com tema só aparecem quando o tema está ativo.

## Integrações
- **Emergent Managed Object Storage** para upload de fotos de produtos (backend `/api/admin/upload` → `/api/files/{path}`)
- **expo-location** para GPS do motoboy
- **react-native-maps** para exibir posição do motoboy no cliente
- **expo-image-picker** para foto (galeria/câmera)
- **Linking** para abrir wa.me/... (WhatsApp)

## Endpoints principais
- `GET /api/products` (com filtro de temas ativos automático)
- `GET /api/neighborhoods` — bairros ativos para o checkout
- `GET /api/themes/active` — banners no home
- `POST /api/orders` — valida múltiplos de 50 e usa fee do bairro escolhido
- `GET /api/orders/{id}` — pedido + `motoboy_location`
- `POST /api/motoboy/{id}/location` — atualizar GPS
- `POST /api/admin/upload` — upload de imagem para Object Storage
- `GET /api/files/{path}` — servir imagem
- `PATCH /api/admin/products/{id}` — editar produto
- `POST|PATCH|DELETE /api/admin/neighborhoods` — CRUD
- `GET /api/admin/themes` + `PATCH /api/admin/themes/{id}/toggle`

## Seeds
- 8 produtos (2 combos base, 2 fritos, 2 congelados, 1 combo Copa, 1 combo Arraiá)
- 4 bairros (Centro R$6, Jardim R$8, Vila Nova R$10, Bairro Alto R$12)
- 2 temas (Copa do Mundo, Festa Junina — desligados por padrão)
- 2 motoboys (seed) + 2 cupons

## Testes
- 26/26 backend pytests passando
- Object storage upload + fetch validado por curl
- Flows visuais validados (home, cardápio, produto, checkout com bairros, admin, configurações, temas, bairros, produtos)

## Notas
- WhatsApp usa `wa.me/<phone>` com mensagem pré-preenchida (sem integração externa).
- Mapa só funciona em Expo Go/build nativo; na web mostra fallback textual.
