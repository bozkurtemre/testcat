PNPM ?= pnpm

.DEFAULT_GOAL := help

.PHONY: help install setup dev dev-desktop build typecheck \
	db-path db-reset db-generate db-migrate desktop-build desktop-preview \
	desktop-package test-electron sim-build testcat-device-deps testcat-device-build doctor

help: ## Show available commands.
	@awk 'BEGIN {FS = ":.*## "; printf "\nUsage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install workspace dependencies.
	$(PNPM) install

setup: install sim-build ## First-time local setup.

dev: ## Run the Electron desktop app.
	$(PNPM) dev

dev-desktop: ## Run only the Electron desktop app.
	$(PNPM) --filter @testcat/desktop dev

build: ## Build all packages.
	$(PNPM) build

typecheck: ## Typecheck all packages.
	$(PNPM) typecheck

db-path: ## Print the SQLite database path used by Electron main.
	$(PNPM) --filter @testcat/desktop exec tsx -e "import { resolveDatabasePath } from './src/main/store/path.ts'; console.log(resolveDatabasePath());"

db-reset: ## Delete the local SQLite database and re-apply migrations.
	$(PNPM) --filter @testcat/desktop exec tsx -e "import { rmSync } from 'node:fs'; import { resolveDatabasePath } from './src/main/store/path.ts'; const p = resolveDatabasePath(); for (const suffix of ['', '-wal', '-shm']) rmSync(p + suffix, { force: true }); console.log('removed ' + p);"
	$(PNPM) db:migrate

db-generate: ## Generate a Drizzle migration from schema changes.
	$(PNPM) db:generate

db-migrate: ## Apply pending Drizzle migrations.
	$(PNPM) db:migrate

desktop-build: ## Build the Electron desktop app.
	$(PNPM) --filter @testcat/desktop build

desktop-preview: ## Preview the built Electron app.
	$(PNPM) --filter @testcat/desktop preview

desktop-package: sim-build ## Build the shareable unsigned DMG/ZIP (embeds a fresh testcat-sim).
	CSC_IDENTITY_AUTO_DISCOVERY=false $(PNPM) --filter @testcat/desktop package
	@ls -lh apps/desktop/release/*.dmg apps/desktop/release/*-mac.zip

test-electron: ## Run the Electron/Playwright smoke test.
	TESTCAT_NATIVE_SCREENSHOT=0 $(PNPM) --filter @testcat/desktop test:electron

sim-build: ## Build the native testcat-sim Swift CLI.
	swift build --package-path native/testcat-sim -c release

testcat-device-deps: ## Install production deps for the vendored physical-device runtime.
	npm install --prefix native/testcat-device/vendor/agent-device --omit=dev --ignore-scripts --package-lock=false

testcat-device-build: testcat-device-deps ## Verify the bundled physical iOS device CLI wrapper.
	test -x native/testcat-device/testcat-device
	native/testcat-device/testcat-device --version
	native/testcat-device/testcat-device doctor

doctor: typecheck desktop-build test-electron ## Run the main local verification checks.
