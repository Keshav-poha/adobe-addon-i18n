# Contributing to `adobe-addon-i18n`

Thank you for investing your time in contributing to our project!

## Getting Started

This project uses npm workspaces. To install dependencies across the monorepo:

```sh
npm install
```

## Developing

- Both `@adobe-addon-i18n/core` and `@adobe-addon-i18n/cli` are located in `packages/`.
- Ensure you have run `npm install` from the root.

## Testing & Linting

Before opening a PR, ensure all tests and linters pass:

```sh
npm run lint
npm run typecheck
npm run test
```

## Pull Requests

- Format your commit messages using the [Conventional Commits](https://www.conventionalcommits.org/) specification.
- Open a PR from a descriptive branch name.
- Address all automated review comments and ensure GitHub Action checks pass.
