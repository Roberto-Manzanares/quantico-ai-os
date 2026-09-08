# Quantico AI OS

Quantico AI OS V1.0 is a multimodel orchestration kernel with COST-FIRST routing,
budget controls, human approval, auditable state, and a local CLI.

## Requirements

- Node.js 20 or later
- npm 10 or later
- Git

Verify the installed runtimes:

```bash
node --version
npm --version
```

## Install from a clone

```bash
git clone https://github.com/Roberto-Manzanares/quantico-ai-os.git
cd quantico-ai-os
npm ci
```

`npm ci` uses the committed lockfile and runs the package build hook. To rebuild
explicitly, run:

```bash
npm run build
```

## First local run

The CLI can be invoked without provider credentials to display its stable command
surface; this makes no provider call:

```bash
npm run cli --
```

To expose the `quantico` command in the current machine's npm environment:

```bash
npm link
quantico
```

## Environment configuration

Provider credentials are optional until a live provider call is requested. Copy the
template locally and set only the provider you intend to use:

```bash
Copy-Item .env.example .env
```

On macOS or Linux, use:

```bash
cp .env.example .env
```

`.env` is ignored by Git. Never commit provider credentials. For scripts that need
the local file, use Node's environment-file support:

```bash
node --env-file-if-exists=.env dist/src/cli.js
```

The CLI's controlled-run and approval commands preserve the Human Approval Gate;
consult `quantico` or `npm run cli --` for the available commands and options.

## Verify an installation

```bash
npm run build
npm run typecheck
npm test
```

These commands do not make provider calls. The separate `smoke:*` scripts require
configured provider credentials and are intentionally not part of installation.
