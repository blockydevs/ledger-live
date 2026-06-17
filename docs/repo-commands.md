# Repo commands

## Commands

### Setup

```bash
mise install    # Install pinned Node, pnpm, and other tools (see mise.toml)
pnpm i          # Install all dependencies
```

Tip: use `pnpm i --ignore-scripts` to skip long or app-specific postinstall steps.

### Development

```bash
pnpm dev:lld            # Start Ledger Live Desktop
pnpm dev:llm:ios        # Start mobile on iOS
pnpm dev:llm:android    # Start mobile on Android
```

### Building

```bash
pnpm build:lld                      # Build desktop (builds deps first via Nx)
pnpm build:llm:deps                 # Build all mobile dependencies
pnpm build:libs                     # Build all libs
pnpm nx run <package-name>:build    # Build a specific lib
```

### Linting & typechecking

```bash
pnpm lint                                 # Lint entire monorepo
pnpm lint:fix                             # Lint + auto-fix
pnpm typecheck                            # Typecheck entire monorepo
pnpm desktop typecheck                    # Typecheck desktop only
pnpm mobile typecheck                     # Typecheck mobile only
pnpm --filter <package-name> typecheck    # Typecheck a specific lib
```

### Testing

```bash
# Desktop (run from repo root)
pnpm nx run ledger-live-desktop:test:jest --with-deps    # Run Jest on desktop
pnpm desktop test:jest "filename"                        # Just rerun a specific test file

# Mobile (run from repo root)
pnpm nx run live-mobile:test:jest --with-deps    # Run all mobile Jest tests
pnpm mobile test:jest "filename"                 # Just rerun a specific test file

# Watch mode (preferred for agentic tasks)
pnpm desktop test:jest:watch
pnpm mobile test:jest:watch

# Library
pnpm nx test @ledgerhq/<package-name>
pnpm nx test @ledgerhq/<package-name> --watch

# Family (run all tests for a coin/bridge family)
pnpm test:family evm        # Runs @ledgerhq/coin-evm, @ledgerhq/coin-tester-evm,
                            #   @ledgerhq/live-signer-evm, @ledgerhq/evm-tools,
                            #   and generic-coin-framework tests inside @ledgerhq/live-common
pnpm test:family bitcoin    # All bitcoin-related packages
pnpm test:family solana     # All solana-related packages
```

## Nx, filtering and aliases

### Aliases vs filtering

Common package aliases give shorter commands. For example, `pnpm desktop test` is equivalent to `pnpm --filter ledger-live-desktop test`.

Prefer the raw `--filter` form when:

- the package has no alias
- you are not in the root directory (aliases only work from root)
- you need advanced filtering (changed packages, dependency graphs, exclusions, globs), e.g.:

```bash
pnpm run test --filter="!./apps/*" --filter="...[HEAD~1]"
```

### Prefer Nx

Prefer `nx` over a raw `--filter` because:

- configs like `dependsOn` (being rolled out across the monorepo) keep dependencies up to date
- flags like `affected`, `base` and `include` enable advanced filtering

In the following example dependencies will be built and tests run on affected files.

```bash
pnpm nx affected -t test --base=HEAD~1 --head=HEAD --exclude=tag:scope:apps
```

#### ✅ Good

Nx builds a project's dependencies before running the target, so
`@ledgerhq/client-ids` is built before its `test` target runs:

```bash
pnpm nx test @ledgerhq/client-ids
```

#### ❌ Bad

⚠️ Skipping `nx` risks dependencies being out of date:

```bash
pnpm --filter @ledgerhq/client-ids test
```
