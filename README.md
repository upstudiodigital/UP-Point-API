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


## PagBank — PIX, crédito e débito

Configurar PAGBANK_ENVIRONMENT=sandbox, PAGBANK_TOKEN e PAGBANK_FRONTEND_URL no .env ignorado. PAGBANK_DEBIT_ENABLED=false até a liberação da conta. PAGBANK_WEBHOOK_URL pode ficar vazio somente em desenvolvimento sandbox local; produção exige URL HTTPS de webhook e da aplicação. O checkout abre fora do UP Point e não coleta cartão/CVV na API. Crédito configurado em uma parcela. Não há boleto configurado; a opção de carteira PagBank é controlada pelo próprio provedor.

POST /payments/orders/:id/checkout exige autenticação, dono ativo, anúncio ativo e pedido não quitado. Calcula a cobrança pelos dados já gravados no banco, persiste payload estável e usa chave de idempotência. Retorna URL apenas em domínio PagBank permitido para o ambiente. Checkout expira em 24 horas; renovação automática não está implementada e exige atendimento. Chamadas são limitadas a 20/usuário/minuto em memória.

POST /payments/orders/:id/sync consulta checkout/pedido no PagBank (dono ou administrador), confirma somente status PAID, referência, BRL, valor total e data válidos. Pagamento não aprova automaticamente o evento. Estorno retira a elegibilidade e preserva a data original do pagamento. Não executa transferências ou reembolsos.

POST /payments/pagbank/webhook é montado antes do parser JSON para preservar os bytes originais. Exige x-authenticity-token validado por SHA-256(token + '-' + rawBody), comparação em tempo constante e nova consulta autenticada ao PagBank. Não confia no status recebido nem em links arbitrários do payload. Repetições são idempotentes. Sem URL pública, usar sync manual; produção não fica pronta sem webhook.

Para testar com dados fictícios no ambiente local:

    npx tsx scripts/seed-payment-demo.ts
    npx tsx scripts/verify-pagbank-sandbox.ts

O primeiro comando prepara um anúncio fictício para development-organizer sem alterar pedidos existentes. O segundo cria/consulta checkout real somente no sandbox, sem pagamento real e sem expor token; guarda resultado em ../.local/pagbank-sandbox-checkout.json. Documentação e limitações em ../UP-Point-Web/docs/pagbank.md.

Testes PagBank: assinatura adulterada, valores/moeda divergentes, captura vs autorização, checkout repetido/concorrente, isolamento por dono, consulta autenticada, notificações duplicadas e estorno com preservação do histórico. Provedor simulado, dados próprios removidos ao terminar. O checkout real foi criado e consultado em sandbox; liquidação por método e webhook externo permanecem como validação de lançamento.


### Correções Sprint 2 — perfil, documento e localização

- CPF/CNPJ obrigatório para criar/editar anúncios; dígitos verificadores validados na API. Essa verificação não comprova identidade ou titularidade. Documento privado no perfil/administrador, ausente da agenda pública.
- Cada envio exige `acceptResponsibility=true`, além da confirmação visual. UF de publicação fixa em SC.
- `/locations/search?address=...`: Photon, acionado pelo botão, com cache de 24h e limite global de uma consulta por 1,1s por processo. `PHOTON_API_URL` permite trocar para instância própria. Protótipo local usa o servidor demo, sem garantia de disponibilidade e sujeito a limites: https://github.com/komoot/photon#demo-server . Antes de escalar produção, usar serviço dedicado e rate limit compartilhado entre réplicas.
- `/weather/forecast?latitude=...&longitude=...&date=...`: Open-Meteo, cache de 15min e limite global de 1 chamada/s por processo; apenas hoje e próximos 15 dias. Fora disso retorna `available:false`. Produção exige `OPEN_METEO_API_KEY` para endpoint comercial: https://open-meteo.com/en/pricing . O plano não foi contratado automaticamente.
- Consultas externas enviam somente endereço público do evento/coordenadas, nunca CPF ou perfil. Atribuições visíveis ao OpenStreetMap e Open-Meteo.

## Atualização 15/10/2026

As regras históricas acima devem ser lidas com as atualizações: publicação paga automática após confirmação server-side, previsão do tempo retirada, recuperação de senha no portal, canal /atendimento e regras públicas unificadas. Guia de implantação em docs/implantacao-e-liberacao.md. Não ativar rotas legadas para recuperar acesso. Sem domínio/hospedagem definidos ou deploy nesta entrega.
