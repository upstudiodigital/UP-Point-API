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

Destaques são configurados no banco; cobrança/painel ficam para outra sprint. Modelo aceita UFs brasileiras, com agenda inicial SC.

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
