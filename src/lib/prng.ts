/**
 * Deterministic pseudo-random utilities. Every value the demo shows is
 * reproducible from a single integer seed so the K-201 story is identical on
 * every run and in every environment.
 */

/** mulberry32 — small, fast, deterministic 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small deterministic random helper bundle built on a single stream. */
export class SeededRandom {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Uniform in [0, 1). */
  unit(): number {
    return this.next();
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Approx. standard normal via averaging (deterministic, bounded). */
  gaussian(mean = 0, stdDev = 1): number {
    const u = (this.next() + this.next() + this.next() + this.next()) / 4;
    return mean + (u - 0.5) * 2 * Math.sqrt(3) * stdDev * 2;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}
