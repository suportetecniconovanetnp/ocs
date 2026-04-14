# Docker

Este diretório adiciona uma build local para o serviço OCS.

## Build

Na raiz do repositório:

```bash
docker build -f docker/Dockerfile -t sigscale-ocs-local .
```

## Execução

```bash
docker run --rm \
  --name ocs \
  -p 8080:8080/tcp \
  -p 1812:1812/udp \
  -p 1813:1813/udp \
  -p 3868:3868/tcp \
  -p 3869:3869/tcp \
  -v ocs-db:/home/otp/db \
  -v ocs-log:/home/otp/log \
  -v ocs-ssl:/home/otp/ssl \
  -v ocs-snmp:/home/otp/snmp \
  sigscale-ocs-local
```

Na primeira inicialização o container:

1. gera certificados TLS autoassinados em `/home/otp/ssl`;
2. instala a release OTP em `/home/otp/releases`;
3. inicializa o banco Mnesia em `/home/otp/db`.

## Compose

No diretório `docker/`:

```bash
docker compose up --build
```

## Variáveis úteis

- `OCS_INIT_DB=true|false`: controla a inicialização automática das tabelas.
- `OCS_NODENAME=ocs`: define o nome do nó Erlang.
- `OCS_SYS_CONFIG=/caminho/para/sys.config`: sobrescreve o `sys.config` ativo da release com um arquivo montado no container.

## sys.config customizado

Monte um arquivo com o conteúdo desejado e aponte `OCS_SYS_CONFIG` para ele.
O entrypoint copia esse arquivo para a release ativa antes de inicializar o banco
e antes de subir o OCS.

Exemplo:

```yaml
services:
  ocs:
    image: sigscale-ocs-local:teste
    environment:
      OCS_SYS_CONFIG: /run/config/ocs/sys.config
    volumes:
      - ./sys.config:/run/config/ocs/sys.config:ro
```

## Logs detalhados de sessao

Por padrao os logs detalhados de sessao ficam desabilitados. Para habilitar,
adicione a chave `{session_debug_logs, true}` no bloco do app `ocs` dentro do
seu `sys.config`.

Quando habilitado, passam a aparecer no `docker logs` eventos como:

- `DIAMETER Ro session request`
- `DIAMETER Ro session result`
- `DIAMETER Ro debit normalization`
- `OCS session trace`
- `OCS stale session cleanup`

Erros reais do sistema, como `DIAMETER AVP unsupported`, continuam aparecendo mesmo com `OCS_SESSION_DEBUG_LOGS=false`.

## Politica de reserva

Foi adicionado um exemplo de configuracao em:

- `docker/sys.config.session-policy.example`

E uma documentacao especifica em:

- `doc/session-reserve-policy.md`

Esses arquivos explicam como combinar:

- `min_reserve_octets|seconds|messages`
- `explicit_reserve_policy`
- `explicit_reserve_octets|seconds|messages`
- `max_reserve_octets|seconds|messages`
- `session_debug_logs`

Resumo rapido:

- `min_reserve_*`: reserva padrao quando o peer nao envia `Requested-Service-Unit`
- `explicit_reserve_policy = requested`: usa o pedido do peer como base
- `explicit_reserve_policy = fixed`: ignora o pedido do peer e usa `explicit_reserve_*`
- `max_reserve_*`: teto do grant quando a politica explicita estiver em `requested`
- o saldo disponivel do assinante sempre limita o grant final

Observacao importante:

- `min_reserve_*` nao interfere em pedidos explicitos do peer
- `explicit_reserve_policy = fixed` normalmente torna `max_reserve_*` desnecessario

## Compose base

Foi adicionado um `docker-compose.yml` na raiz do projeto com base no ambiente informado durante a investigacao.

O arquivo usa:

- a imagem `sigscale-ocs-local:teste`
- bind de `/opt/ocs/sys.config` para `/run/config/ocs/sys.config`

Se voce ja mantem o `sys.config` em outro caminho, por exemplo `/opt/ocs/sys.config`, basta ajustar o volume correspondente no `docker-compose.yml`.
