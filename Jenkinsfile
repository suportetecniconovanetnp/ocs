pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Branch Gate') {
            steps {
                script {
                    if (env.BRANCH_NAME != 'dev') {
                        currentBuild.description = "Pipeline ativa apenas para a branch dev (branch atual: ${env.BRANCH_NAME ?: 'desconhecida'})"
                    }
                }
                echo "Branch atual: ${env.BRANCH_NAME ?: 'desconhecida'}"
            }
        }

        stage('Build and Test') {
            when {
                branch 'dev'
            }

            environment {
                OTP_VERSION = '21'
                BUILD_ROOT = '.build/otp-21'
                ERL_LIBS = "${WORKSPACE}/.build/otp-21/lib"
                ERLANG_INSTALL_LIB_DIR = "${WORKSPACE}/.build/otp-21/lib"
                DIALYZER_PLT = "${WORKSPACE}/.build/otp-21/.dialyzer_plt"
                BUILD_RUNTIME = ''
            }

            stages {
                stage('Check Toolchain') {
                    steps {
                        script {
                            if (sh(returnStatus: true, script: 'command -v erl >/dev/null 2>&1') == 0) {
                                env.BUILD_RUNTIME = 'host'
                                sh '''
                                    set -eu
                                    if ! command -v rebar3 >/dev/null 2>&1; then
                                      if command -v apt-get >/dev/null 2>&1; then
                                        apt-get update
                                        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends rebar3 nodejs yarnpkg
                                      else
                                        echo "rebar3 nao encontrado e apt-get indisponivel" >&2
                                        exit 1
                                      fi
                                    fi
                                    if ! command -v yarn >/dev/null 2>&1; then
                                      if command -v apt-get >/dev/null 2>&1; then
                                        apt-get update
                                        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs yarnpkg
                                        ln -sf /usr/bin/yarnpkg /usr/local/bin/yarn 2>/dev/null || true
                                      else
                                        echo "yarn nao encontrado e apt-get indisponivel" >&2
                                        exit 1
                                      fi
                                    fi
                                    erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().' -noshell
                                    autoconf --version
                                    automake --version
                                    libtoolize --version
                                    make --version
                                    git --version
                                    rebar3 version
                                    yarn --version
                                '''
                            } else if (sh(returnStatus: true, script: 'command -v docker >/dev/null 2>&1') == 0) {
                                env.BUILD_RUNTIME = 'docker'
                                sh '''
                                    set -eu
                                    docker --version
                                '''
                            } else if (sh(returnStatus: true, script: 'command -v apt-get >/dev/null 2>&1') == 0) {
                                env.BUILD_RUNTIME = 'bootstrap'
                                sh '''
                                    set -eux
                                    apt-get update
                                    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
                                      erlang erlang-dev erlang-src erlang-dialyzer \
                                      autoconf automake libtool make gcc g++ pkg-config git curl ca-certificates libssl-dev rebar3 nodejs yarnpkg
                                    ln -sf /usr/bin/yarnpkg /usr/local/bin/yarn 2>/dev/null || true
                                    erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().' -noshell
                                    autoconf --version
                                    automake --version
                                    libtoolize --version
                                    make --version
                                    git --version
                                    rebar3 version
                                    yarn --version
                                '''
                            } else {
                                error('O agente Jenkins nao possui Erlang no PATH, Docker CLI ou apt-get disponivel para bootstrap.')
                            }
                        }
                    }
                }

                stage('Build') {
                    steps {
                        script {
                            if (env.BUILD_RUNTIME == 'docker') {
                                sh '''
                                    docker run --rm \\
                                      -v "$WORKSPACE:$WORKSPACE" \\
                                      -w "$WORKSPACE" \\
                                      -e BUILD_ROOT="$BUILD_ROOT" \\
                                      -e ERL_LIBS="$ERL_LIBS" \\
                                      -e ERLANG_INSTALL_LIB_DIR="$ERLANG_INSTALL_LIB_DIR" \\
                                      erlang:$OTP_VERSION /bin/bash -lc '
                                        set -eux
                                        apt-get update
                                        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \\
                                          autoconf automake libtool make gcc g++ pkg-config git curl ca-certificates libssl-dev rebar3 nodejs yarnpkg
                                        ln -sf /usr/bin/yarnpkg /usr/local/bin/yarn 2>/dev/null || true

                                        aclocal
                                        autoheader
                                        autoconf
                                        libtoolize --automake
                                        automake --add-missing

                                        rm -rf "${BUILD_ROOT}"
                                        mkdir -p "${BUILD_ROOT}/lib" "${BUILD_ROOT}/ocs"
                                        cd "${BUILD_ROOT}"

                                        git clone https://github.com/mochi/mochiweb.git
                                        cd mochiweb
                                        make all
                                        MOCHIWEB_APP="$(find . -path '*/mochiweb.app' | head -n 1)"
                                        MOCHIWEB_VERSION="$(grep vsn "$MOCHIWEB_APP" | cut -d'"'"'"'"'"'"'"'"' -f 2)"
                                        cd ..
                                        mkdir -p "lib/mochiweb-${MOCHIWEB_VERSION}"
                                        cp -R mochiweb/ebin "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                        cp -R mochiweb/include "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                        cp -R mochiweb/priv "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                        cp -R mochiweb/_build/default/lib/mochiweb/ebin "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                        cp -R mochiweb/_build/default/lib/mochiweb/include "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                        cp -R mochiweb/_build/default/lib/mochiweb/priv "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true

                                        git clone https://gitlab.com/sigscale/radierl.git
                                        cd radierl
                                        aclocal
                                        autoheader
                                        autoconf
                                        automake --add-missing
                                        ./configure
                                        make
                                        make install
                                        cd ..

                                        git clone https://gitlab.com/sigscale/sigscale_mibs.git
                                        cd sigscale_mibs
                                        aclocal
                                        autoheader
                                        autoconf
                                        automake --add-missing
                                        ./configure
                                        make
                                        make install
                                        cd ..

                                        cd ocs
                                        ../../../configure
                                        make
                                      '
                                '''
                            } else {
                                sh '''
                                    set -eux

                                    aclocal
                                    autoheader
                                    autoconf
                                    libtoolize --automake
                                    automake --add-missing

                                    rm -rf "${BUILD_ROOT}"
                                    mkdir -p "${BUILD_ROOT}/lib" "${BUILD_ROOT}/ocs"
                                    cd "${BUILD_ROOT}"

                                    git clone https://github.com/mochi/mochiweb.git
                                    cd mochiweb
                                    make all
                                    MOCHIWEB_APP="$(find . -path '*/mochiweb.app' | head -n 1)"
                                    MOCHIWEB_VERSION="$(grep vsn "$MOCHIWEB_APP" | cut -d'"' -f 2)"
                                    cd ..
                                    mkdir -p "lib/mochiweb-${MOCHIWEB_VERSION}"
                                    cp -R mochiweb/ebin "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                    cp -R mochiweb/include "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                    cp -R mochiweb/priv "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                    cp -R mochiweb/_build/default/lib/mochiweb/ebin "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                    cp -R mochiweb/_build/default/lib/mochiweb/include "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true
                                    cp -R mochiweb/_build/default/lib/mochiweb/priv "lib/mochiweb-${MOCHIWEB_VERSION}/" 2>/dev/null || true

                                    git clone https://gitlab.com/sigscale/radierl.git
                                    cd radierl
                                    aclocal
                                    autoheader
                                    autoconf
                                    automake --add-missing
                                    ./configure
                                    make
                                    make install
                                    cd ..

                                    git clone https://gitlab.com/sigscale/sigscale_mibs.git
                                    cd sigscale_mibs
                                    aclocal
                                    autoheader
                                    autoconf
                                    automake --add-missing
                                    ./configure
                                    make
                                    make install
                                    cd ..

                                    cd ocs
                                    ../../../configure
                                    make
                                '''
                            }
                        }
                    }
                }

                stage('Test') {
                    steps {
                        script {
                            if (env.BUILD_RUNTIME == 'docker') {
                                sh '''
                                    docker run --rm \\
                                      -v "$WORKSPACE:$WORKSPACE" \\
                                      -w "$WORKSPACE" \\
                                      -e BUILD_ROOT="$BUILD_ROOT" \\
                                      -e ERL_LIBS="$ERL_LIBS" \\
                                      -e ERLANG_INSTALL_LIB_DIR="$ERLANG_INSTALL_LIB_DIR" \\
                                      -e DIALYZER_PLT="$DIALYZER_PLT" \\
                                      erlang:$OTP_VERSION /bin/bash -lc '
                                        set -eux
                                        apt-get update
                                        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \\
                                          autoconf automake libtool make gcc g++ pkg-config git curl ca-certificates libssl-dev rebar3 nodejs yarnpkg
                                        ln -sf /usr/bin/yarnpkg /usr/local/bin/yarn 2>/dev/null || true

                                        if ! dialyzer --plt_info; then
                                          dialyzer --no_native --build_plt \\
                                            --apps erts kernel stdlib crypto compiler public_key diameter inets mnesia ssl mochiweb radius syntax_tools
                                        fi
                                        cd "${BUILD_ROOT}/ocs"
                                        make check
                                      '
                                '''
                            } else {
                                sh '''
                                    set -eux
                                    if ! dialyzer --plt_info; then
                                      dialyzer --no_native --build_plt \
                                        --apps erts kernel stdlib crypto compiler public_key diameter inets mnesia ssl mochiweb radius syntax_tools
                                    fi
                                    cd "${BUILD_ROOT}/ocs"
                                    make check
                                '''
                            }
                        }
                    }
                }
            }
        }

        stage('Publish Artifacts') {
            agent any

            when {
                branch 'dev'
            }

            steps {
                archiveArtifacts artifacts: '.build/otp-*/ocs/doc/**/*,.build/otp-*/ocs/test/log/**/*', allowEmptyArchive: true
            }
        }
    }
}
