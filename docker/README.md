# Docker

Empacotamento Docker do SigScale OCS com configuração 100% por variáveis de
ambiente e logs (incluindo IPDR) acessíveis diretamente no host.

## Inicio rápido

Na raiz do repositório:

```bash
cp .env.example .env              # ajuste as portas / nomes / segredos
mkdir -p data                     # diretorio onde logs / db / certs serao bindados
sudo chown -R 1000:1000 data      # UID do user `otp` na imagem (fixado em 1000)
docker compose up -d
```

> A imagem fixa `UID=1000` e `GID=1000` para o usuário `otp`. Se preferir outro
> UID, rebuild com `docker build --build-arg OCS_UID=<X> --build-arg OCS_GID=<Y> ...`
> e aplique o mesmo `chown` nos diretórios do host. Imagens antigas (antes dessa
> mudança) usam UID dinâmico do `useradd --system`: descubra com
> `docker run --rm --entrypoint id <imagem> otp` e faça `chown` com o valor retornado.

A partir de agora:

- logs aparecem em `data/log/{ipdr,acct,auth,abmf,http,export}/...` no host;
- DB Mnesia em `data/db/`;
- certificados auto-assinados em `data/ssl/`;
- arquivos SNMP em `data/snmp/`.

Ou seja, `tail -f data/log/ipdr/*` funciona sem `docker exec`.

## Como a configuração é gerada

Por padrão **não há `sys.config` no host**. O entrypoint renderiza o arquivo
inteiro a partir das `OCS_*` lidas do `.env` (ou do ambiente) na inicialização
do container, e grava na release ativa antes de subir o OCS.

Knobs disponíveis (ver `.env.example` na raiz para a lista completa com
defaults):

| Categoria | Variáveis |
|---|---|
| RADIUS | `OCS_RADIUS_AUTH_PORT`, `OCS_RADIUS_ACCT_PORT` |
| Diameter | `OCS_DIAMETER_ACCT_PORT`, `OCS_DIAMETER_AUTH_PORT`, `OCS_DIAMETER_ORIGIN_HOST`, `OCS_DIAMETER_ORIGIN_REALM` |
| HTTP | `OCS_HTTP_PORT`, `OCS_HTTP_TLS`, `OCS_HTTP_AUTH_REQUIRE_GROUP`, `OCS_HTTP_LOG_SIZE_BYTES`, `OCS_HTTP_LOG_FILE_COUNT` |
| Logs | `OCS_{ACCT,AUTH,ABMF,IPDR,HTTP}_LOG_DIR`, `OCS_EXPORT_DIR`, `OCS_ACCT_LOG_ROTATE_MIN`, `OCS_ACCT_LOG_ROTATE_TIME` |
| TLS | `OCS_TLS_KEY`, `OCS_TLS_CERT`, `OCS_TLS_CACERT` |
| Mnesia / SNMP | `OCS_MNESIA_DIR`, `OCS_SNMP_CONF_DIR`, `OCS_SNMP_DB_DIR` |
| Charging | `OCS_MIN_RESERVE_*`, `OCS_EXPLICIT_RESERVE_*`, `OCS_MAX_RESERVE_*`, `OCS_SESSION_DEBUG_LOGS` |
| Bootstrap | `OCS_INIT_DB`, `OCS_NODENAME`, `OCS_DEBUG` |
| Compose | `OCS_IMAGE`, `OCS_HOSTNAME`, `OCS_BIND_HOST`, `OCS_DATA_DIR`, `OCS_*_PORT_HOST` |

Tipos com sintaxe Erlang (ex. tuplas) precisam vir formatados — por exemplo
`OCS_ACCT_LOG_ROTATE_TIME={4,4,4}`, `OCS_EXPLICIT_RESERVE_OCTETS=undefined`.

## Override avançado: sys.config próprio

Quando precisar de chaves não expostas pelo renderer, monte um `sys.config`
completo no container e aponte `OCS_SYS_CONFIG` para ele:

```yaml
services:
  ocs:
    environment:
      OCS_SYS_CONFIG: /run/config/ocs/sys.config
    volumes:
      - ./sys.config:/run/config/ocs/sys.config:ro
```

O entrypoint detecta a variável e usa o arquivo do host inteiro em vez do
template, normalizando placeholders `lib/@PACKAGE@-@VERSION@/...` e
`lib/ocs-3.4.X/...` para a release instalada.

## Build

```bash
docker build -f docker/Dockerfile -t sigscale-ocs-local .
```

Ou via compose dev (que reusa o `.env` da raiz):

```bash
docker compose -f docker/compose.yaml up --build
```

## Bootstrap

Na primeira inicialização o container:

1. cria a árvore `data/{db,log/{acct,auth,abmf,ipdr,http,export},ssl,snmp/{conf,db}}`;
2. gera certificados TLS auto-assinados em `data/ssl/`;
3. instala a release OTP;
4. inicializa o banco Mnesia (controlado por `OCS_INIT_DB`);
5. renderiza `sys.config` a partir do `.env` (ou copia o `OCS_SYS_CONFIG` se setado).

## Logs detalhados de sessão

Setar `OCS_SESSION_DEBUG_LOGS=true` no `.env` faz o renderer incluir
`{session_debug_logs, true}` no `sys.config`. A partir daí aparecem em
`docker logs ocs` eventos como:

- `DIAMETER Ro session request`
- `DIAMETER Ro session result`
- `DIAMETER Ro debit normalization`
- `OCS session trace`
- `OCS stale session cleanup`

Erros reais do sistema (ex. `DIAMETER AVP unsupported`) sempre aparecem,
independente da flag.

## Política de reserva

Documentação detalhada em `doc/session-reserve-policy.md` e exemplo de
`sys.config` correspondente em `docker/sys.config.session-policy.example`.

Resumo:

- `OCS_MIN_RESERVE_*` — reserva padrão quando o peer não envia `Requested-Service-Unit`
- `OCS_EXPLICIT_RESERVE_POLICY=requested` — usa o pedido do peer como base
- `OCS_EXPLICIT_RESERVE_POLICY=fixed` — ignora o pedido e usa `OCS_EXPLICIT_RESERVE_*`
- `OCS_MAX_RESERVE_*` — teto do grant quando a política está em `requested`
- o saldo disponível do assinante sempre limita o grant final

Observações:

- `min_reserve_*` não interfere em pedidos explícitos do peer
- `explicit_reserve_policy=fixed` normalmente torna `max_reserve_*` desnecessário
