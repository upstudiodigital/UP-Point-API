# UP Point API — Sprint 2

Backend em TypeScript, Express, Prisma e PostgreSQL. Os novos módulos, scripts e testes usam checagem estrita (tsconfig.portal.json); o legado mantém sua checagem anterior até a revisão administrativa.

## Executar

Node >= 22.12.0 e PostgreSQL. Copie .env.example para .env, configure DATABASE_URL e JWT_SECRET aleatório com pelo menos 32 caracteres. Nunca versione segredos.

    npm ci
    npm run prisma:generate
    npx prisma migrate deploy
    npm run dev

API: http://127.0.0.1:3333. Frontend: http://127.0.0.1:5174.

Neste computador: PostgreSQL 17 em ../.local/pg-runtime, cluster ../.local/pgdata, porta 5434, banco uppoint_dev. Senha aleatória apenas local. Para reiniciar, a partir da pasta UP-POINT:

    & '.local/pg-runtime/pgsql/bin/pg_ctl.exe' -D '.local/pgdata' -l '.local/postgres.log' -o '-h 127.0.0.1 -p 5434' start

Binários oficiais: https://www.postgresql.org/download/windows/ e https://www.enterprisedb.com/download-postgresql-binaries .

## Imagens e fixtures

Desenvolvimento: UPLOAD_STORAGE=local grava banners em uploads/ (ignorado no Git). Produção: Cloudinary com CLOUDINARY_NAME, CLOUDINARY_KEY, CLOUDINARY_SECRET. JPG/PNG até 5 MB com assinatura validada; armazenamento local desabilitado em NODE_ENV=production.

    npm run seed:dev

Seed restrito a uppoint_dev na porta 5434: seis eventos marcados como Demonstração e uma conta fictícia. Credenciais aleatórias em ../.local/demo-account.json, fora dos repositórios. Reexecutar o seed atualiza a senha da conta fictícia.

## API

- POST /auth/register: name, email, password (8–128 caracteres), acceptTerms=true; retorna user/token.
- POST /auth/login: account e password; retorna user/token.
- GET /auth/me: Bearer token; retorna id/name/email.
- GET /events?state=SC&q=texto: eventos ativos, até 500, ordenados por data/horário.
- GET /events/featured: destaques ativos de SC dentro do período, por prioridade.
- GET /events/:id: evento ativo público.
- POST /events: Bearer token, multipart/form-data: name, description, category, venue, city, state, date (AAAA-MM-DD), time (HH:mm), phone, url opcional, priceCents e bannerEvento.
- PUT /events/:id: Bearer token do dono, mesmos campos de dados em JSON, preservando banner.
- DELETE /events/:id: Bearer token do dono; desativa.
- GET /health: processo disponível.

JWT HS256 por 8 horas, sem senha no payload. Novos hashes bcrypt com custo 12. Limitação de autenticação por IP em memória; múltiplas instâncias exigem armazenamento compartilhado. Logout remove a sessão local, sem revogar um token copiado. Conta registra o aceite explícito nos campos existentes de termos/privacidade e na data de criação.

Aprovar um pedido elegível para carrossel aplica featuredPriority. Recebimento PIX depende da definição do provedor. Modelo aceita UFs brasileiras, com agenda inicial SC.

## Verificar

    npm run typecheck
    npm run build
    npm test

Integração com API e banco local iniciados, UPLOAD_STORAGE=local (PowerShell):

    $env:RUN_INTEGRATION='1'
    npm test
    Remove-Item Env:RUN_INTEGRATION

Testes usam dados fictícios, removem seus próprios registros/uploads e recusam banco fora do ambiente local.

## Legado

Rotas administrativas e pagamentos desabilitadas por padrão. ENABLE_LEGACY_ROUTES=true somente para revisão controlada; esses módulos ainda precisam de auditoria. Webhook antigo retorna 501 devido a serviços ausentes. Build gerado em dist/ não é versionado. Migrações em banco de produção exigem backup e revisão dos dados existentes.


## Painéis e anúncios

Novos anúncios têm moderationStatus=pending; GET /events e os detalhes públicos só retornam approved. A posição é cards ou carousel. A API calcula R$ 0 na primeira publicação aos cards, R$ 10 nas próximas e R$ 50 para carrossel. freeAdUsed e AdOrder são gravados juntos sob bloqueio transacional por usuário. A gratuidade permanece no anúncio em correções e não é devolvida ao excluí-lo.

- GET /account/dashboard: eventos/pedidos exclusivos da conta, elegibilidade à gratuidade.
- GET /account/events/:id: anúncio privado do dono para edição.
- GET/PATCH /account/profile: dados da conta; PATCH aceita multipart name, phone, avatar JPG/PNG. Não altera email/permissões.
- GET /admin/dashboard: eventos, pedidos, contas (sem senha), ações e tráfego agregado. Exige usuário ativo com typeAccess=admin consultado no banco.
- PATCH /admin/events/:id: operation approve/reject/delete; recusa exige reason. Aprovação exige pedido free/paid; exclusão desativa e preserva o histórico.
- PATCH /admin/users/:id: status boolean; não permite bloquear a própria conta nem outra conta administrativa.
- POST /analytics/page-view: contador diário agregado no fuso de São Paulo, limitado a 30 chamadas/IP/minuto em memória. Não registra visitante/IP no banco; não representa usuários únicos.

O painel lista até 1.000 registros por conjunto (eventos/pedidos/contas), 100 ações e 30 dias de tráfego. Receita total vem de agregação de todos os pedidos pagos; o gráfico financeiro deriva dos pedidos listados. Paginação e relatórios completos serão necessários ao ultrapassar esse volume.

PIX ainda não configurado: novos pedidos com valor positivo ficam awaiting_configuration; não existe endpoint público para marcar pagamento manualmente. Não há QR Code real, webhook ou conciliação nesta versão. A integração futura deverá verificar assinatura, valor/moeda, identificar o pedido e registrar paidAt de forma idempotente. Rejeição/reembolso/vencimento dependem da política e do provedor escolhido.

Conta administrativa de demonstração (somente após autorização, banco local):

    npx tsx scripts/create-development-admin.ts

Credenciais em ../.local/admin-account.json, não versionadas. Em produção, provisionar administradores pelo procedimento interno autorizado; o cadastro público sempre cria client. O script não funciona fora de uppoint_dev em 127.0.0.1:5434.
