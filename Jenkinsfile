pipeline {
    agent none

    options {
        disableConcurrentBuilds()
        timestamps()
        ansiColor('xterm')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Branch Gate') {
            agent any
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

            matrix {
                axes {
                    axis {
                        name 'OTP_VERSION'
                        values '18', '20', '21'
                    }
                }

                agent {
                    docker {
                        image "erlang:${OTP_VERSION}"
                        reuseNode true
                    }
                }

                environment {
                    BUILD_ROOT = ".build/otp-${OTP_VERSION}"
                    ERL_LIBS = "${WORKSPACE}/.build/otp-${OTP_VERSION}/lib"
                    ERLANG_INSTALL_LIB_DIR = "${WORKSPACE}/.build/otp-${OTP_VERSION}/lib"
                    DIALYZER_PLT = "${WORKSPACE}/.build/otp-${OTP_VERSION}/.dialyzer_plt"
                }

                stages {
                    stage('Install Toolchain') {
                        steps {
                            sh '''
                                set -eux
                                apt-get update
                                DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
                                  autoconf automake libtool make gcc g++ pkg-config \
                                  git curl ca-certificates gnupg libssl-dev nodejs npm
                                npm install -g yarn
                            '''
                        }
                    }

                    stage('Build') {
                        steps {
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
                                MOCHIWEB_VERSION="$(grep vsn ebin/mochiweb.app | cut -d'"' -f 2)"
                                cd ..
                                mv mochiweb "lib/mochiweb-${MOCHIWEB_VERSION}"

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

                    stage('Test') {
                        steps {
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
