// `server-only` is supplied by Next.js at build time — it is a build-time
// poison pill that makes the bundler fail if a module is pulled into a client
// bundle, not a runtime dependency, so it does not exist in node_modules.
//
// Vitest resolves imports itself and therefore cannot find it, which made every
// module under lib/server/ that imports it (7 of them) impossible to unit test.
// Aliasing it to this empty module in vitest.config.ts restores that, without
// weakening the guarantee: the real check still runs during `next build`.
export {}
