#!/usr/bin/env bash
set -euo pipefail

export HOME="${HOME:-/home/otp}"
export OCS_HOME="${OCS_HOME:-/home/otp}"
export OCS_NODENAME="${OCS_NODENAME:-ocs}"
export OCS_DEBUG="${OCS_DEBUG:-true}"
export OCS_ERLANG_ROOT="${OCS_ERLANG_ROOT:-/usr/local/lib/erlang}"
export OCS_SYS_CONFIG="${OCS_SYS_CONFIG:-}"

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

apply_custom_sys_config() {
  local target
  if [[ -z "${OCS_SYS_CONFIG}" ]]; then
    return 0
  fi

  if [[ ! -f "${OCS_SYS_CONFIG}" ]]; then
    echo "Arquivo informado em OCS_SYS_CONFIG nao existe: ${OCS_SYS_CONFIG}" >&2
    exit 1
  fi

  target="$(release_sys_config).config"
  log "aplicando sys.config customizado de ${OCS_SYS_CONFIG} para ${target}"
  cp "${OCS_SYS_CONFIG}" "${target}"
}

bootstrap() {
  log "iniciando bootstrap"
  mkdir -p "${OCS_HOME}/db" "${OCS_HOME}/log" "${OCS_HOME}/ssl" "${OCS_HOME}/snmp/conf" "${OCS_HOME}/snmp/db"

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
