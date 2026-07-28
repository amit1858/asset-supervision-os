// Test stub for the `server-only` marker. In production/Next the real package
// throws if imported from a client bundle; under vitest (node) we alias it to
// this no-op so server-only modules can be unit-tested directly.
export {};
