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
                OTP_VERSION = 'system'
                BUILD_ROOT = '.build/otp-system'
                ERL_LIBS = "${WORKSPACE}/.build/otp-system/lib"
                ERLANG_INSTALL_LIB_DIR = "${WORKSPACE}/.build/otp-system/lib"
                DIALYZER_PLT = "${WORKSPACE}/.build/otp-system/.dialyzer_plt"
            }

            stages {
                stage('Check Toolchain') {
                    steps {
                        sh '''
                            set -eu
                            erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().' -noshell
                            autoconf --version
                            automake --version
                            libtoolize --version
                            make --version
                            git --version
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
