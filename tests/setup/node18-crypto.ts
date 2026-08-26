// Node 18 exposes `globalThis.crypto` via a lazy accessor that isn't always
// resolved the same way inside Vitest's esbuild-transformed module graph —
// the `mongodb` driver (a mongoose dependency) references the bare `crypto`
// identifier at call time (uuidV4 -> ServerSession), and on Node 18.x under
// Vitest that throws `ReferenceError: crypto is not defined` even though
// plain Node scripts see `globalThis.crypto` fine. Reproduced on real Node
// 18 (fails) vs Node 20 (passes) with an identical build via Docker before
// landing this fix. Explicitly assigning the global sidesteps whatever lazy
// resolution Node 18 relies on. Node 20+ already exposes this correctly, so
// the assignment there is a harmless no-op.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('node:crypto').webcrypto as Crypto;
}
