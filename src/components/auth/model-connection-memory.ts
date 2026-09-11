/**
 * A deliberately tiny in-memory credential vault.
 *
 * The value exists only inside this closure. There is no serialization method
 * and no browser/server persistence dependency. A page reload creates a new,
 * empty vault.
 */
export interface VolatileCredentialVault {
  set: (credential: string) => void;
  get: () => string | null;
  clear: () => void;
}

export function createVolatileCredentialVault(): VolatileCredentialVault {
  let credential: string | null = null;
  return {
    set(next) {
      credential = next;
    },
    get() {
      return credential;
    },
    clear() {
      credential = null;
    },
  };
}
