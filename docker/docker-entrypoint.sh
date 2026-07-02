#!/usr/bin/env bash
set -euo pipefail

# Assign a default to an environment variable if unset or empty.
# Uses explicit string assignment instead of ${VAR:-default} because the
# latter is fragile when the default contains characters the bash lexer
# treats specially (notably `{...,...}` which can trigger brace expansion).
env_default() {
  local name="$1" default="$2"
  if [[ -z "${!name:-}" ]]; then
    printf -v "${name}" '%s' "${default}"
  fi
  export "${name}"
}

env_default HOME '/home/otp'
env_default OCS_HOME '/home/otp'
env_default OCS_NODENAME 'ocs'
env_default OCS_DEBUG 'true'
env_default OCS_ERLANG_ROOT '/usr/local/lib/erlang'
env_default OCS_SYS_CONFIG ''

# ----------------------------------------------------------------------------
# Defaults for env-driven sys.config rendering.
#
# The whole sys.config is generated on container start from these variables
# unless OCS_SYS_CONFIG points to a pre-baked file (power-user override).
# Add new knobs here and reference them from render_sys_config().
# ----------------------------------------------------------------------------

# RADIUS
env_default OCS_RADIUS_AUTH_ADDR '0.0.0.0'
env_default OCS_RADIUS_AUTH_PORT '1812'
env_default OCS_RADIUS_ACCT_ADDR '0.0.0.0'
env_default OCS_RADIUS_ACCT_PORT '1813'

# Diameter
env_default OCS_DIAMETER_ACCT_ADDR '0.0.0.0'
env_default OCS_DIAMETER_ACCT_PORT '3868'
env_default OCS_DIAMETER_AUTH_ADDR '0.0.0.0'
env_default OCS_DIAMETER_AUTH_PORT '3869'
env_default OCS_DIAMETER_ORIGIN_HOST 'ocs.localdomain'
env_default OCS_DIAMETER_ORIGIN_REALM 'localdomain'

# HTTP
env_default OCS_HTTP_PORT '8080'
env_default OCS_HTTP_TLS 'false'
env_default OCS_HTTP_AUTH_REQUIRE_GROUP 'staff'
env_default OCS_HTTP_LOG_SIZE_BYTES '10485760'
env_default OCS_HTTP_LOG_FILE_COUNT '10'

# Logs (relative to OCS_HOME unless absolute)
env_default OCS_ACCT_LOG_DIR 'log/acct'
env_default OCS_AUTH_LOG_DIR 'log/auth'
env_default OCS_ABMF_LOG_DIR 'log/abmf'
env_default OCS_IPDR_LOG_DIR 'log/ipdr'
env_default OCS_HTTP_LOG_DIR 'log/http'
env_default OCS_EXPORT_DIR 'log/export'
env_default OCS_ACCT_LOG_ROTATE_MIN '1440'
env_default OCS_ACCT_LOG_ROTATE_TIME '{4,4,4}'

# Per-log retention (matches the ocs.app defaults: 10 MiB per file, 100 files).
# Each log is a FIFO disk_log wrap log, so total on-disk footprint per log is
# bounded by SIZE_BYTES * FILE_COUNT.
env_default OCS_ACCT_LOG_SIZE_BYTES '10485760'
env_default OCS_ACCT_LOG_FILE_COUNT '100'
env_default OCS_AUTH_LOG_SIZE_BYTES '10485760'
env_default OCS_AUTH_LOG_FILE_COUNT '100'
env_default OCS_ABMF_LOG_SIZE_BYTES '10485760'
env_default OCS_ABMF_LOG_FILE_COUNT '100'

# TLS
env_default OCS_TLS_KEY 'ssl/key.pem'
env_default OCS_TLS_CERT 'ssl/cert.pem'
env_default OCS_TLS_CACERT 'ssl/ca.pem'

# Mnesia / SNMP
env_default OCS_MNESIA_DIR 'db'
env_default OCS_SNMP_CONF_DIR 'snmp/conf'
env_default OCS_SNMP_DB_DIR 'snmp/db'

# Session-charging policy (mirrors docker/sys.config.session-policy.example)
env_default OCS_MIN_RESERVE_OCTETS '10000000'
env_default OCS_MIN_RESERVE_SECONDS '60'
env_default OCS_MIN_RESERVE_MESSAGES '1'
env_default OCS_CHARGING_SCHEDULER_TIME '{4,4,4}'
env_default OCS_CHARGING_INTERVAL '1440'
env_default OCS_EXPLICIT_RESERVE_POLICY 'requested'
env_default OCS_EXPLICIT_RESERVE_OCTETS 'undefined'
env_default OCS_EXPLICIT_RESERVE_SECONDS 'undefined'
env_default OCS_EXPLICIT_RESERVE_MESSAGES 'undefined'
env_default OCS_MAX_RESERVE_OCTETS '10000000'
env_default OCS_MAX_RESERVE_SECONDS 'undefined'
env_default OCS_MAX_RESERVE_MESSAGES 'undefined'
env_default OCS_SESSION_DEBUG_LOGS 'false'

log() {
  printf '[ocs-entrypoint] %s\n' "$*"
}

if [[ "${OCS_DEBUG}" == "true" ]]; then
  set -x
fi

trap 'rc=$?; log "falha na linha ${LINENO} com exit code ${rc}"; exit "${rc}"' ERR

show_release_state() {
  log "estado atual da release em ${OCS_HOME}"
  ls -la "${OCS_HOME}" || true
  ls -la "${OCS_HOME}/releases" || true
  if [[ -f "${OCS_HOME}/releases/start_erl.data" ]]; then
    log "conteudo de start_erl.data:"
    cat "${OCS_HOME}/releases/start_erl.data" || true
  fi
  find "${OCS_HOME}" -maxdepth 3 \( -name '*.boot' -o -name '*.script' -o -name '*.rel' \) | sort || true
}

release_name() {
  local tarball
  tarball="$(find "${OCS_HOME}/releases" -maxdepth 1 -type f -name 'ocs-*.tar.gz' | sort | tail -n 1 || true)"
  if [[ -z "${tarball}" ]]; then
    echo "Nenhum pacote de release foi encontrado em ${OCS_HOME}/releases" >&2
    exit 1
  fi
  basename "${tarball}" .tar.gz
}

release_sys_config() {
  local rel
  rel="$(release_name)"
  printf '%s/releases/%s/sys' "${OCS_HOME}" "${rel}"
}

# Convert OCS_HTTP_TLS=true into the essl socket_type tuple, otherwise ip_comm.
http_socket_type() {
  if [[ "${OCS_HTTP_TLS}" == "true" ]]; then
    cat <<EOF
{socket_type, {essl,
                  [{certfile, "${OCS_TLS_CERT}"},
                   {keyfile, "${OCS_TLS_KEY}"}]}}
EOF
  else
    printf '%s' '{socket_type, ip_comm}'
  fi
}

# ----------------------------------------------------------------------------
# Render a complete Erlang sys.config file from the OCS_* environment vars.
# Tokens are substituted by the shell, so any value that needs Erlang syntax
# (e.g. tuples like {4,4,4}) must be passed already-formatted via the env.
# ----------------------------------------------------------------------------
render_sys_config() {
  local target="$1"
  local rel package version
  rel="$(release_name)"
  package="${rel%%-*}"
  version="${rel#${package}-}"

  log "renderizando sys.config a partir de variaveis de ambiente em ${target}"
  cat > "${target}" <<EOF
[{ocs,
      [{radius,
               [{auth,
                      [{{0,0,0,0}, ${OCS_RADIUS_AUTH_PORT}, []}]},
               {acct,
                     [{{0,0,0,0}, ${OCS_RADIUS_ACCT_PORT}, []}]}]},
      {diameter,
               [{acct,
                      [{{0,0,0,0}, ${OCS_DIAMETER_ACCT_PORT},
                          [{'Origin-Host', "${OCS_DIAMETER_ORIGIN_HOST}"},
                           {'Origin-Realm', "${OCS_DIAMETER_ORIGIN_REALM}"},
                           {sub_id_type, [imsi, msisdn]},
                           {application_id, 4}]}]},
               {auth,
                     [{{0,0,0,0}, ${OCS_DIAMETER_AUTH_PORT}, []}]}]},

      %% Default reservation used when the peer does not send
      %% Requested-Service-Unit.
      {min_reserve_octets, ${OCS_MIN_RESERVE_OCTETS}},
      {min_reserve_seconds, ${OCS_MIN_RESERVE_SECONDS}},
      {min_reserve_messages, ${OCS_MIN_RESERVE_MESSAGES}},
      {charging_scheduler_time, ${OCS_CHARGING_SCHEDULER_TIME}},
      {charging_interval, ${OCS_CHARGING_INTERVAL}},

      %% Explicit peer request policy.
      {explicit_reserve_policy, ${OCS_EXPLICIT_RESERVE_POLICY}},
      {explicit_reserve_octets, ${OCS_EXPLICIT_RESERVE_OCTETS}},
      {explicit_reserve_seconds, ${OCS_EXPLICIT_RESERVE_SECONDS}},
      {explicit_reserve_messages, ${OCS_EXPLICIT_RESERVE_MESSAGES}},

      %% Maximum reservation returned in a single grant.
      {max_reserve_octets, ${OCS_MAX_RESERVE_OCTETS}},
      {max_reserve_seconds, ${OCS_MAX_RESERVE_SECONDS}},
      {max_reserve_messages, ${OCS_MAX_RESERVE_MESSAGES}},

      {session_debug_logs, ${OCS_SESSION_DEBUG_LOGS}},

      {acct_log_rotate, ${OCS_ACCT_LOG_ROTATE_MIN}},
      {acct_log_rotate_time, ${OCS_ACCT_LOG_ROTATE_TIME}},
      {acct_log_dir, "${OCS_ACCT_LOG_DIR}"},
      {acct_log_size, ${OCS_ACCT_LOG_SIZE_BYTES}},
      {acct_log_files, ${OCS_ACCT_LOG_FILE_COUNT}},
      {auth_log_dir, "${OCS_AUTH_LOG_DIR}"},
      {auth_log_size, ${OCS_AUTH_LOG_SIZE_BYTES}},
      {auth_log_files, ${OCS_AUTH_LOG_FILE_COUNT}},
      {abmf_log_dir, "${OCS_ABMF_LOG_DIR}"},
      {abmf_log_size, ${OCS_ABMF_LOG_SIZE_BYTES}},
      {abmf_log_files, ${OCS_ABMF_LOG_FILE_COUNT}},
      {ipdr_log_dir, "${OCS_IPDR_LOG_DIR}"},
      {export_dir, "${OCS_EXPORT_DIR}"},
      {tls_key, "${OCS_TLS_KEY}"},
      {tls_cert, "${OCS_TLS_CERT}"},
      {tls_cacert, "${OCS_TLS_CACERT}"}]},
{radius,
      [{sock_opts, [{recbuf, 131072}, {sndbuf, 131072}]}]},
{mnesia,
      [{dir, "${OCS_MNESIA_DIR}"}]},
{snmp,
      [{agent,
           [{config, [{dir, "${OCS_SNMP_CONF_DIR}"}]},
           {db_dir, "${OCS_SNMP_DB_DIR}"}]}]},
{inets,
      [{services,
         [{httpd,
            [{server_name, "ocs"},
            {directory_index, ["index.html"]},
            {directory, {"/schema", []}},
            {directory, {"/doc", []}},
            {directory, {"/health", []}},
            {directory, {"/partyRoleManagement", []}},
            {directory, {"/",
                  [{auth_type, mnesia},
                  {auth_name, "ocs.sigscale.org"},
                  {require_group, ["${OCS_HTTP_AUTH_REQUIRE_GROUP}"]}]}},
            {transfer_disk_log, "${OCS_HTTP_LOG_DIR}/transfer"},
            {security_disk_log, "${OCS_HTTP_LOG_DIR}/security"},
            {error_disk_log, "${OCS_HTTP_LOG_DIR}/error"},
            {transfer_disk_log_size, {${OCS_HTTP_LOG_SIZE_BYTES}, ${OCS_HTTP_LOG_FILE_COUNT}}},
            {error_disk_log_size, {${OCS_HTTP_LOG_SIZE_BYTES}, ${OCS_HTTP_LOG_FILE_COUNT}}},
            {security_disk_log_size, {${OCS_HTTP_LOG_SIZE_BYTES}, ${OCS_HTTP_LOG_FILE_COUNT}}},
            {disk_log_format, internal},
            {modules,
                  [mod_alias,
                  mod_auth,
                  mod_responsecontrol,
                  mod_ocs_rest_accepted_content,
                  mod_ocs_rest_get,
                  mod_get,
                  mod_ocs_rest_head,
                  mod_ocs_rest_post,
                  mod_ocs_rest_patch,
                  mod_ocs_rest_delete,
                  mod_disk_log]},
            {mime_types,
                  [{"html", "text/html"},
                  {"css", "text/css"},
                  {"js", "application/javascript"},
                  {"json", "application/json"},
                  {"jsonld", "application/linkset+json; profile=\"https://www.rfc-editor.org/info/rfc9727\""},
                  {"svg", "image/svg+xml"},
                  {"png", "image/png"},
                  {"csv", "text/csv"}]},
            {port, ${OCS_HTTP_PORT}},
            $(http_socket_type),
            {server_root, "./"},
            {alias, {"/doc", "lib/${rel}/doc"}},
            {alias, {"/schema", "lib/${rel}/priv/schema"}},
            {alias, {"/legacy", "lib/${rel}/priv/www"}},
            {alias, {"/.well-known/api-catalog",
                  "lib/${rel}/priv/schema/api-catalog.linkset.jsonld"}},
            {document_root, "lib/${rel}/priv/www-next"}]}]}]}].
EOF
}

apply_custom_sys_config() {
  local target rel package version
  target="$(release_sys_config).config"

  if [[ -n "${OCS_SYS_CONFIG}" ]]; then
    if [[ ! -f "${OCS_SYS_CONFIG}" ]]; then
      echo "Arquivo informado em OCS_SYS_CONFIG nao existe: ${OCS_SYS_CONFIG}" >&2
      exit 1
    fi
    rel="$(release_name)"
    package="${rel%%-*}"
    version="${rel#${package}-}"
    log "aplicando sys.config customizado de ${OCS_SYS_CONFIG} para ${target}"
    cp "${OCS_SYS_CONFIG}" "${target}"
    sed -i \
      -e "s|lib/${package}-[^/]*/|lib/${rel}/|g" \
      -e "s|lib/@PACKAGE@-@VERSION@/|lib/${rel}/|g" \
      -e "s|@PACKAGE@|${package}|g" \
      -e "s|@VERSION@|${version}|g" \
      "${target}"
  else
    render_sys_config "${target}"
  fi

  # Help diagnose rendering issues (empty vars, bad quoting, etc.) by
  # dumping the resolved file under DEBUG. Erlang reports only the line
  # number on a syntax error, so seeing the rendered content is essential.
  if [[ "${OCS_DEBUG}" == "true" ]]; then
    log "conteudo do sys.config ativo (${target}):"
    nl -ba "${target}" >&2 || cat "${target}" >&2
  fi
}

bootstrap() {
  log "iniciando bootstrap"
  mkdir -p "${OCS_HOME}/db" \
           "${OCS_HOME}/log/acct" "${OCS_HOME}/log/auth" "${OCS_HOME}/log/abmf" \
           "${OCS_HOME}/log/ipdr" "${OCS_HOME}/log/http" "${OCS_HOME}/log/export" \
           "${OCS_HOME}/ssl" "${OCS_HOME}/snmp/conf" "${OCS_HOME}/snmp/db"

  if [[ ! -f "${OCS_HOME}/ssl/cert.pem" ]]; then
    log "gerando certificados TLS"
    /opt/ocs-docker/install_certs.sh
  else
    log "certificados TLS ja existem"
  fi

  if [[ ! -f "${OCS_HOME}/snmp/conf/standard.conf" ]]; then
    log "gerando configuracao SNMP"
    /opt/ocs-docker/install_snmp.sh
  else
    log "configuracao SNMP ja existe"
  fi

  if [[ ! -f "${OCS_HOME}/releases/RELEASES" ]]; then
    log "instalando release inicial"
    /opt/ocs-docker/install_release.sh "$(release_name)"
  else
    log "release ja instalada"
  fi

  apply_custom_sys_config

  if [[ "${OCS_INIT_DB:-true}" == "true" && ! -d "${OCS_HOME}/db/Mnesia.nonode@nohost" ]]; then
    log "inicializando tabelas do banco"
    log "usando sys.config em $(release_sys_config)"
    ERL_LIBS=lib ERL_FLAGS="-config $(release_sys_config) -sname ${OCS_NODENAME}" escript /opt/ocs-docker/install_tables.escript
  else
    log "pulando inicializacao do banco"
  fi

  show_release_state
}

start_ocs() {
  local start_erl
  start_erl=""

  if [[ -x "${OCS_ERLANG_ROOT}/bin/start_erl" ]]; then
    start_erl="${OCS_ERLANG_ROOT}/bin/start_erl"
  elif compgen -G "${OCS_ERLANG_ROOT}/erts-"*"/bin/start_erl" > /dev/null; then
    start_erl="$(compgen -G "${OCS_ERLANG_ROOT}/erts-"*"/bin/start_erl" | head -n 1)"
  else
    start_erl="$(command -v start_erl || true)"
  fi

  if [[ -z "${start_erl}" ]]; then
    log "start_erl nao encontrado. caminhos verificados:"
    ls -la "${OCS_ERLANG_ROOT}" || true
    ls -la "${OCS_ERLANG_ROOT}/bin" || true
    find "${OCS_ERLANG_ROOT}" -maxdepth 4 -name start_erl | sort || true
    echo "start_erl nao encontrado" >&2
    exit 1
  fi

  log "start_erl encontrado em ${start_erl}"
  log "subindo OCS com nodename=${OCS_NODENAME}"
  show_release_state

  exec env ERL_LIBS=lib \
    "${start_erl}" "${OCS_ERLANG_ROOT}" "${OCS_HOME}/releases" "${OCS_HOME}/releases/start_erl.data" \
    -boot_var OTPHOME . +K true +A 32 +Bi -sname "${OCS_NODENAME}" -noshell
}

case "${1:-start}" in
  start)
    bootstrap
    start_ocs
    ;;
  initialize)
    bootstrap
    ;;
  shell)
    shift
    exec /bin/bash "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
