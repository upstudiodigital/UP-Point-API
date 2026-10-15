# Implantação e liberação — UP Point

Estado: preparados os arquivos; domínio/hospedagem ainda não escolhidos pelo responsável. Não houve deploy. Os Dockerfiles e workflows novos precisam ser executados no ambiente escolhido antes de marcar este item como homologado.

1. Manter `UP-Point-Web` e `UP-Point-API` separados. Banco PostgreSQL gerenciado, com rede privada e credenciais exclusivas de produção. Nunca copiar `.local`, contas de teste ou o banco uppoint_dev para produção.
2. Definir domínio e HTTPS; configurar frontend para `/api` no proxy ou `VITE_API_URL` público. Servir fallback SPA para rotas diretas. A configuração Nginx de referência espera um serviço de rede chamado `api` na porta 3333; adaptar para a hospedagem real.
3. Configurar NODE_ENV=production, HOST/PORT, JWT_SECRET novo, FRONTEND_URL HTTPS, FRONTEND_ORIGINS exatas, PUBLIC_API_URL, Cloudinary e SMTP. TRUST_PROXY=true somente atrás de um proxy confiável de uma camada; não habilitar indiscriminadamente. Assegurar acesso por HTTPS no proxy.
4. Executar `npm run preflight:production`. Ele não imprime segredos e retorna falha para configurações ausentes. Pagamentos são excluídos desse comando por decisão do usuário.
5. Executar backup antes de migrações: `npm run backup -- caminho-privado/backup.dump`. pg_dump deve estar disponível ou ser informado em PG_DUMP_PATH. Guardar cópia criptografada fora do servidor, acesso restrito e retenção definida. Não versionar dumps.
6. Rodar `npx prisma migrate deploy` como operação de release, antes de iniciar a API. Revisar migrações em homologação e restaurar backup em banco isolado. Não usar migrate reset em produção.
7. `/health` confirma processo; `/ready` verifica consulta ao PostgreSQL. Monitorar status HTTP, falhas de login, uploads e fila de emails, sem registrar tokens, senhas ou parâmetros de recuperação. Configurar alarmes externos com responsável e canal reais.
8. Em processo persistente há um ciclo de comprovantes por minuto. Para agendador separado, usar `npm run receipts:deliver`. A fila já reserva itens atomicamente por cinco minutos; manter timeout SMTP menor que a reserva. Message-ID estável ajuda a rastrear, mas entrega SMTP não oferece garantia absoluta de exatamente uma vez em falha após envio.
9. Começar com uma instância enquanto o rate limit é em memória. Antes de escalar horizontalmente, adotar limitação compartilhada no gateway/Redis e validar concorrência e filas.
10. Realizar smoke test externo: cadastro/login/recuperação, publicação, aprovação gratuita, liberação paga simulada, retirada/bloqueio, expiração, mídia, mapa, termos, quatro idiomas e mobile. Homologação de pagamento real fica para o responsável.
11. Fazer teste físico de Android/iOS, teclado e leitores de tela e teste de carga com volume-alvo. CI unitária e screenshots de viewport não substituem esses aceites.
12. Consolidar commits de ambos os projetos e guardar PDF/evidências de QA em backup. Rollback de aplicativo deve manter compatibilidade do schema; não reverter SQL destrutivamente sem plano e restauração testados.

## Resultado já demonstrado localmente

Backup custom PostgreSQL e restauração em banco temporário foram executados: 3 contas e 18 eventos conferidos; o banco original foi preservado e a cópia de teste removida. Artefato fica em `.local/backups` (privado/fora do Git). Para repetir somente neste ambiente: `node node_modules/tsx/dist/cli.mjs scripts/verify-local-restore.ts ../.local/pg-runtime/pgsql/bin`, a partir da API. Script recusa banco diferente de uppoint_dev em 127.0.0.1:5434.

## Dependências humanas ainda abertas

- Domínio/hospedagem: responsável respondeu “não definido”.
- Marca indicada: UP Point; link de desenvolvimento continua https://upstudiodigital.com.br/. Isso não substitui razão social/CNPJ e canal público de suporte; ainda não informados.
- SMTP, Cloudinary e identificação pública: inserir valores verdadeiros nos ambientes, sem publicar segredos.
- Retenção, atendimento/denúncias, revisão dos termos e plano de exposição/cancelamento: validação operacional necessária.
- Decisão nova do responsável: anúncio pago ativo é liberado automaticamente no primeiro pagamento confirmado; não reabrir conteúdo removido/recusado com webhook repetido. Gratuitos seguem análise. A homologação dos métodos de pagamento será realizada ao final pelo responsável.

Relatório complementar desta rodada: `testes/Relatorio-QA-Ajustes-Lancamento-2026-10-15.pdf` na raiz da workspace. Evidências em `testes/evidencias/2026-10-15-ajustes-lancamento`. Atendimento interno já disponível em /atendimento e /admin/atendimento; email público opcional não é requisito do formulário, mas definir responsável e prazo de resposta continua necessário.
