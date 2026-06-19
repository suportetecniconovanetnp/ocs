FROM erlang:21 AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV ERLANG_INSTALL_LIB_DIR=/home/otp/lib
ENV OCS_HOME=/home/otp
ENV BUILD_ROOT=/tmp/ocs-build
ENV STAGE_ROOT=/opt/ocs-root
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN sed -i 's|deb.debian.org/debian|archive.debian.org/debian|g; s|deb.debian.org/debian-security|archive.debian.org/debian-security|g' /etc/apt/sources.list \
    && sed -i '/buster-updates/d' /etc/apt/sources.list \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid-until \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        autoconf \
        automake \
        build-essential \
        ca-certificates \
        erlang-mochiweb \
        curl \
        git \
        libssl-dev \
        libtool \
        pkg-config \
    && curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && curl -fsSL https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb https://dl.yarnpkg.com/debian/ stable main" > /etc/apt/sources.list.d/yarn.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs yarn \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build/ocs
COPY . .

RUN aclocal \
    && autoheader \
    && autoconf \
    && libtoolize --automake \
    && automake --add-missing

RUN mkdir -p "${BUILD_ROOT}/lib" "${STAGE_ROOT}${OCS_HOME}/lib" \
    && MOCHIWEB_APP="$(find /usr/lib/erlang/lib /usr/local/lib/erlang/lib -type f -path '*/mochiweb*/ebin/mochiweb.app' 2>/dev/null | head -n 1)" \
    && test -n "${MOCHIWEB_APP}" \
    && MOCHIWEB_VERSION="$(sed -n 's/.*vsn, *\"\([^\"]*\)\".*/\1/p' "${MOCHIWEB_APP}" | head -n 1)" \
    && cp -R "$(dirname "$(dirname "${MOCHIWEB_APP}")")" "${STAGE_ROOT}${OCS_HOME}/lib/mochiweb-${MOCHIWEB_VERSION}" \
    && export ERL_LIBS="${STAGE_ROOT}${OCS_HOME}/lib" \
    && git clone --depth 1 https://gitlab.com/sigscale/radierl.git "${BUILD_ROOT}/radierl" \
    && cd "${BUILD_ROOT}/radierl" \
    && aclocal \
    && autoheader \
    && autoconf \
    && automake --add-missing \
    && ./configure --with-systemdsystemunitdir=no \
    && make \
    && make DESTDIR="${STAGE_ROOT}" install \
    && git clone --depth 1 https://gitlab.com/sigscale/sigscale_mibs.git "${BUILD_ROOT}/sigscale_mibs" \
    && cd "${BUILD_ROOT}/sigscale_mibs" \
    && aclocal \
    && autoheader \
    && autoconf \
    && automake --add-missing \
    && ./configure --with-systemdsystemunitdir=no \
    && make \
    && make DESTDIR="${STAGE_ROOT}" install \
    && cd /build/ocs \
    && ./configure --with-systemdsystemunitdir=no \
    && make \
    && make DESTDIR="${STAGE_ROOT}" install

FROM erlang:21

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV HOME=/home/otp
ENV OCS_HOME=/home/otp
ENV OCS_NODENAME=ocs
ENV OCS_INIT_DB=true

# Fixed UID/GID so host bind mounts can be chowned to a predictable owner
# (avoids the "Permission denied" mkdir failure on first start when the host
# directory is owned by an unrelated user). Matches the conventional first
# user on most Linux hosts — easy to align with `chown 1000:1000`.
ARG OCS_UID=1000
ARG OCS_GID=1000

RUN sed -i 's|deb.debian.org/debian|archive.debian.org/debian|g; s|deb.debian.org/debian-security|archive.debian.org/debian-security|g' /etc/apt/sources.list \
    && sed -i '/buster-updates/d' /etc/apt/sources.list \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid-until \
    && apt-get update \
    && apt-get install -y --no-install-recommends bash openssl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid ${OCS_GID} otp \
    && useradd --uid ${OCS_UID} --gid ${OCS_GID} --create-home --home-dir /home/otp --shell /bin/bash otp

COPY --from=builder /opt/ocs-root/home/otp/ /home/otp/
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY docker/initialize.sh /usr/local/bin/initialize
COPY scripts/install_release.sh /opt/ocs-docker/install_release.sh
COPY scripts/install_certs.sh /opt/ocs-docker/install_certs.sh
COPY scripts/install_snmp.sh /opt/ocs-docker/install_snmp.sh
COPY scripts/install_tables.escript /opt/ocs-docker/install_tables.escript

RUN chmod 755 /usr/local/bin/docker-entrypoint.sh /usr/local/bin/initialize \
        /opt/ocs-docker/install_release.sh /opt/ocs-docker/install_certs.sh /opt/ocs-docker/install_snmp.sh /opt/ocs-docker/install_tables.escript \
    && mkdir -p /home/otp/db /home/otp/log /home/otp/ssl /home/otp/snmp/conf /home/otp/snmp/db /home/otp/bin \
    && chown -R otp:otp /home/otp /opt/ocs-docker

WORKDIR /home/otp
USER otp

EXPOSE 8080/tcp 1812/udp 1813/udp 3868/tcp 3869/tcp
VOLUME ["/home/otp/db", "/home/otp/log", "/home/otp/ssl", "/home/otp/snmp"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["start"]
