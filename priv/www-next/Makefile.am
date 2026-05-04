## Makefile.am
## vim: ts=3
##
## Vite/Vue 3 build for the modernised SigScale OCS web UI.
## Runs alongside the legacy Polymer build (priv/www) during the
## strangler-fig migration. Output lands in $(wwwnextdir).

wwwnextdir = $(wwwdir)-next

EXTRA_DIST = package.json vite.config.ts tsconfig.json tsconfig.node.json \
		eslint.config.js .prettierrc.json index.html public \
		src locales tests playwright.config.ts

if BUILD_WWW_NEXT

all-local: dist/index.html

node_modules/.install-stamp: package.json
	npm install --no-audit --no-fund
	touch $@

dist/index.html: node_modules/.install-stamp $(shell find $(srcdir)/src -type f) \
		$(shell find $(srcdir)/locales -type f) \
		$(shell find $(srcdir)/public -type f) index.html vite.config.ts
	npm run build

check-local:
	npm run lint
	npm run type-check
	npm test

install-data-local: dist/index.html
	$(MKDIR_P) $(DESTDIR)$(wwwnextdir)
	cp -R dist/* $(DESTDIR)$(wwwnextdir)

clean-local:
	-rm -rf dist .vite

distclean-local:
	-rm -rf node_modules

endif
