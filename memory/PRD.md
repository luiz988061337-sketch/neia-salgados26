# Néia Salgados — PRD

## Visão
App mobile (Expo) para clientes fazerem pedidos de salgados da Néia com rastreamento em tempo real, painel admin completo, taxas por km, aviso automático, agendamento, aniversariantes e horário de funcionamento.

## Novas funcionalidades (5)

### 1. Status "Em preparo" (antes "Fritando")
- Label alterado em todo o app (timeline, painel admin, WhatsApp)
- ID interno segue como `fritando` para manter compatibilidade com dados existentes

### 2. Cardápio de Domingo (horário de funcionamento)
- Settings: `open_days` (0=Dom..6=Sáb, default [1..6] Seg-Sáb), `open_time` "10:00", `close_time` "20:00"
- Home mostra banner amarelo 🌙 "Loja fechada" quando fora do horário
- Checkout bloqueia pedido sem agendamento fora do horário; força toggle "Agendar"
- Backend `POST /api/orders` rejeita 400 se loja fechada e sem `scheduled_for`
- Admin edita dias e horários em Configurações → Loja & Taxa por km

### 3. Cupom de Aniversário
- Campo aniversário (MM-DD) opcional no checkout
- Ao criar pedido, se `birthday` == hoje → aplica automático cupom `ANIVERSARIO{pct}%` (padrão 20%, editável no admin)
- Perfil do cliente persistido em `db.customers` (upsert por telefone)
- Admin → **Aniversariantes de Hoje**: lista clientes que aniversariam, botão "Enviar cupons para todos" (via Twilio se configurado, senão wa.me em massa)
- `GET /api/admin/birthdays/today` e `POST /api/admin/birthdays/send` (idempotente por dia/cliente)

### 4. Combos Sugestivos
- No combo builder, se o cliente concentra tudo em 1 sabor, aparece card "Que tal misturar sabores?" → toca e o app distribui igualmente entre todos os sabores

### 5. Aviso pelo Servidor (Twilio WhatsApp)
- Backend integra `twilio` SDK (endpoint `PATCH /api/admin/orders/{id}/status` envia mensagem se `auto_whatsapp=True` e Twilio configurado)
- Fallback gracioso: se Twilio não configurado, admin app abre wa.me no celular (comportamento anterior)
- Store settings mostra badge verde ✅/amarelo ⚠️ indicando se Twilio está pronto
- Env vars TWILIO_* em `backend/.env` como placeholders — usuário preenche em Publish → Secrets

## Endpoints novos
- `GET /api/store-status` — is_open, open_days, open_time, close_time
- `GET /api/admin/birthdays/today` — clientes que aniversariam hoje
- `POST /api/admin/birthdays/send` — envia cupons via Twilio (idempotente)
- Settings agora aceita `open_days`, `open_time`, `close_time`, `birthday_coupon_pct`
- `GET /api/admin/settings` inclui `twilio_ready: bool`

## Como o admin configura Twilio
1. Criar conta em twilio.com → Messaging → Try WhatsApp (Sandbox)
2. Copiar `Account SID`, `API Key SID`, `API Key Secret` (ou Auth Token)
3. Publish → Secrets no Emergent:
   - TWILIO_ACCOUNT_SID
   - TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (recomendado) OU TWILIO_AUTH_TOKEN
   - TWILIO_WHATSAPP_FROM (`whatsapp:+14155238886` no Sandbox)
4. Cliente precisa enviar `join <código>` para o Sandbox antes de receber
5. Após deploy, badge no admin muda para "✅ Twilio configurado"

## Testes
- 26/26 backend pytests passando (agora com `scheduled_for` para bypassar horário)
- Fluxos validados via curl:
  - Loja fechada → 400 ✓
  - Scheduled_for → aceita ✓
  - Aniversário hoje → aplica 20% off automaticamente ✓
  - `send-birthdays` retorna `twilio_not_configured` gracefully ✓
- Screenshots visuais confirmam: banner "Loja fechada" na home, dias da semana no admin, aniversariantes com badge Twilio, hub de configurações com 6 opções

## Notas
- Sandbox Twilio: número de teste `+14155238886`; clientes precisam fazer join para receber; produção requer template aprovado + número Business
- WhatsApp opt-in: campo `whatsapp_opt_in=true` por padrão; adicionar checkbox no futuro se necessário
- Combos Sugestivos: aparece quando 1 único sabor selecionado com >= (n_sabores × 5)
