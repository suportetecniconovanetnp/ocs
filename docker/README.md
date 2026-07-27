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
| Retenção de log | `OCS_{ACCT,AUTH,ABMF}_LOG_SIZE_BYTES`, `OCS_{ACCT,AUTH,ABMF}_LOG_FILE_COUNT` |
| TLS | `OCS_TLS_KEY`, `OCS_TLS_CERT`, `OCS_TLS_CACERT` |
| Mnesia / SNMP | `OCS_MNESIA_DIR`, `OCS_SNMP_CONF_DIR`, `OCS_SNMP_DB_DIR` |
| Charging | `OCS_MIN_RESERVE_*`, `OCS_CHARGING_SCHEDULER_TIME`, `OCS_CHARGING_INTERVAL`, `OCS_FORCE_MONTHLY_RENEWAL_*`, `OCS_EXPLICIT_RESERVE_*`, `OCS_MAX_RESERVE_*`, `OCS_SESSION_DEBUG_LOGS` |
| Bootstrap | `OCS_INIT_DB`, `OCS_NODENAME`, `OCS_DEBUG` |
| Compose | `OCS_IMAGE`, `OCS_HOSTNAME`, `OCS_BIND_HOST`, `OCS_DATA_DIR`, `OCS_*_PORT_HOST` |

Tipos com sintaxe Erlang (ex. tuplas) precisam vir formatados — por exemplo
`OCS_ACCT_LOG_ROTATE_TIME={4,4,4}`, `OCS_EXPLICIT_RESERVE_OCTETS=undefined`.

## Exemplo: Portainer (stack inline)

O Portainer funciona melhor com todas as variáveis **declaradas no próprio
compose** — a UI dele renderiza tudo num único formulário editável. Evite
`env_file:` no Portainer (caminhos relativos do `.env` não são resolvidos de
forma confiável).

### Preparação do host

```bash
sudo mkdir -p /opt/ocs/data/{db,log,ssl,snmp}
sudo chown -R 1000:1000 /opt/ocs/data
```

### Stack

```yaml
services:
  ocs:
    image: sigscale-ocs-local:v3.4.59-bugfix-claude
    restart: unless-stopped
    hostname: ocs
    ports:
      - "127.0.0.251:8080:8080/tcp"
      - "127.0.0.251:1812:1812/udp"
      - "127.0.0.251:1813:1813/udp"
      - "127.0.0.251:3868:3868/tcp"
      - "127.0.0.251:3869:3869/tcp"
    environment:
      # Bootstrap
      OCS_INIT_DB: "true"
      OCS_NODENAME: "ocs"
      OCS_DEBUG: "true"
      TZ: America/Belem

      # Diameter Gy/Ro (Origin/Realm)
      OCS_DIAMETER_ACCT_PORT: "3868"
      OCS_DIAMETER_AUTH_PORT: "3869"
      OCS_DIAMETER_ORIGIN_HOST: "ocs.localdomain"
      OCS_DIAMETER_ORIGIN_REALM: "localdomain"

      # RADIUS
      OCS_RADIUS_AUTH_PORT: "1812"
      OCS_RADIUS_ACCT_PORT: "1813"

      # HTTP / REST
      OCS_HTTP_PORT: "8080"
      OCS_HTTP_TLS: "false"
      OCS_HTTP_AUTH_REQUIRE_GROUP: "staff"

      # Política de reserva (substitui sys.config customizado)
      OCS_EXPLICIT_RESERVE_POLICY: "fixed"
      OCS_EXPLICIT_RESERVE_OCTETS: "10000000"
      OCS_EXPLICIT_RESERVE_SECONDS: "undefined"
      OCS_EXPLICIT_RESERVE_MESSAGES: "undefined"
      OCS_MIN_RESERVE_OCTETS: "10000000"
      OCS_MIN_RESERVE_SECONDS: "60"
      OCS_MIN_RESERVE_MESSAGES: "1"
      OCS_CHARGING_SCHEDULER_TIME: "{3,5,0}"
      OCS_CHARGING_INTERVAL: "1440"
      OCS_FORCE_MONTHLY_RENEWAL_ENABLED: "true"
      OCS_FORCE_MONTHLY_RENEWAL_DAY: "28"
      OCS_FORCE_MONTHLY_RENEWAL_TIME: "{3,0,0}"
      OCS_MAX_RESERVE_OCTETS: "undefined"
      OCS_MAX_RESERVE_SECONDS: "undefined"
      OCS_MAX_RESERVE_MESSAGES: "undefined"
      OCS_SESSION_DEBUG_LOGS: "true"

      # Rotação de log
      OCS_ACCT_LOG_ROTATE_MIN: "1440"
      OCS_ACCT_LOG_ROTATE_TIME: "{4,4,4}"

      # Retenção de log (FIFO wrap log: SIZE_BYTES * FILE_COUNT por log).
      # Aumente FILE_COUNT para manter mais eventos consultáveis pela UI/REST.
      # Defaults upstream: 10 MiB × 100 = ~1 GiB por log.
      OCS_ACCT_LOG_SIZE_BYTES: "10485760"
      OCS_ACCT_LOG_FILE_COUNT: "100"
      OCS_AUTH_LOG_SIZE_BYTES: "10485760"
      OCS_AUTH_LOG_FILE_COUNT: "100"
      OCS_ABMF_LOG_SIZE_BYTES: "10485760"
      OCS_ABMF_LOG_FILE_COUNT: "100"

    volumes:
      - /etc/localtime:/etc/localtime:ro
      - /etc/timezone:/etc/timezone:ro
      - /opt/ocs/data/db:/home/otp/db
      - /opt/ocs/data/log:/home/otp/log
      - /opt/ocs/data/ssl:/home/otp/ssl
      - /opt/ocs/data/snmp:/home/otp/snmp
```

### Dicas Portainer

- Para editar uma variável depois de subir o stack: **Stacks → ocs →
  Editor**, muda o valor, **Update the stack**. Não precisa rebuild.
- Para ver o `sys.config` efetivo que o entrypoint gerou, mantenha
  `OCS_DEBUG=true` e olhe em **Containers → ocs → Logs** — o arquivo é
  dumpado com numeração de linhas logo após a bootstrap.
- Logs IPDR ficam em `/opt/ocs/data/log/ipdr/` no host (acessíveis pelo
  file browser do Portainer em **Hosts → Volumes** ou via `ssh`).

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

## Scheduler de renovacao recorrente

As renovacoes de produtos recorrentes sao controladas por duas variaveis:

- `OCS_CHARGING_SCHEDULER_TIME`: tupla Erlang `{H,M,S}` em UTC que define o
  ponto de ancoragem da agenda.
- `OCS_CHARGING_INTERVAL`: intervalo, em minutos, entre as execucoes do job.

Exemplos:

- Rodar 1x por dia as `00:05` em `America/Belem` (`UTC-03`):
  `OCS_CHARGING_SCHEDULER_TIME={3,5,0}` e `OCS_CHARGING_INTERVAL=1440`
- Rodar de hora em hora:
  `OCS_CHARGING_SCHEDULER_TIME={0,0,0}` e `OCS_CHARGING_INTERVAL=60`
- Rodar a cada 15 minutos:
  `OCS_CHARGING_SCHEDULER_TIME={0,0,0}` e `OCS_CHARGING_INTERVAL=15`

O job e agendado em UTC pela aplicacao. Se quiser horario local, converta o
horario desejado para UTC antes de preencher `OCS_CHARGING_SCHEDULER_TIME`.

## Override global de renovacao mensal

Para realinhar renovacoes mensais legadas sem editar buckets em massa, use:

- `OCS_FORCE_MONTHLY_RENEWAL_ENABLED`
- `OCS_FORCE_MONTHLY_RENEWAL_DAY`
- `OCS_FORCE_MONTHLY_RENEWAL_TIME`

Exemplo:

- `OCS_FORCE_MONTHLY_RENEWAL_ENABLED=true`
- `OCS_FORCE_MONTHLY_RENEWAL_DAY=28`
- `OCS_FORCE_MONTHLY_RENEWAL_TIME={3,0,0}`

Regras:

- a hora e interpretada em UTC
- a regra vale apenas para recorrencia `monthly`
- a regra so atua quando a oferta nao tem `month_day` explicito
- se o dia configurado nao existir no mes, o OCS usa o ultimo dia do mes

Se quiser pensar em horario local, converta antes para UTC e grave o valor
ja convertido em `OCS_FORCE_MONTHLY_RENEWAL_TIME`.

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
