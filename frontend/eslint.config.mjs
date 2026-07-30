// ESLint flat config — replaces .eslintrc.json (ESLint 10 dropped eslintrc).
//
// Lint no longer runs through `next lint`. That command is a thin wrapper over
// the ESLint API, and Next 14's copy (installed when this was decided; the app
// is on 15 now) passed options ESLint 9 removed (`useEslintrc`, `extensions`,
// `resolvePluginsRelativeTo`, …), so it failed outright against any ESLint ≥ 9:
//
//     Invalid Options: - Unknown options: useEslintrc, extensions, …
//
// So `npm run lint` calls `eslint` directly. This is the direction Next itself
// is going — `next lint` is deprecated in 15 and removed in 16 — which means
// decoupling now also removes a blocker from a future Next major, rather than
// trading one pin for another.
//
// `eslint-config-next` is intentionally ahead of the installed Next (16.x
// config against Next 15.x). It declares no `next` peer dependency; it is a
// rule set, not a runtime, and the 16 line is the one that ships flat config
// and carries patched transitive deps. Its `next/typescript` block brings
// typescript-eslint in already, so there is no separate parser wiring here.

import next from 'eslint-config-next/core-web-vitals'

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'next-env.d.ts',
      'src/app/globals.compiled.css',
    ],
  },
  ...next,
  {
    // ── eslint-plugin-react-hooks v7: warn, don't block ──────────────────────
    //
    // eslint-config-next 16 pulls react-hooks v7, the React Compiler rule set.
    // The old config (ecn 14) shipped react-hooks v4, which had exactly two
    // rules: rules-of-hooks and exhaustive-deps. v7 adds a dozen more, and they
    // fire 66 times across code that predates them:
    //
    //     27  react-hooks/set-state-in-effect
    //     26  react-hooks/static-components
    //      6  react-hooks/refs
    //      3  react-hooks/immutability
    //      2  react-hooks/use-memo
    //      1  react-hooks/purity
    //      1  react-hooks/preserve-manual-memoization
    //
    // None of these is a security finding, and none was reported by the config
    // this replaced — they are a new, stricter policy arriving with the upgrade.
    // Fixing 66 call sites is a real refactor with real behaviour risk, and it
    // does not belong in a commit whose purpose is patching CVEs in dev tooling.
    //
    // So they are 'warn': visible on every run and in CI output, but not a gate.
    // That is deliberate — 'off' would erase the backlog, and 'error' would
    // either block the security fix or pressure someone into a rushed refactor.
    // Promote them back to 'error' as the sites get fixed; the counts above are
    // the baseline to measure against.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
    },
  },
]
