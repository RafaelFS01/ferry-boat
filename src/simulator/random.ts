export type RandomSource = () => number;

// PRNG local: a seed reproduz apenas os sensores, nunca os UUIDs dos pacotes.
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(random: RandomSource): number {
  return Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) *
    Math.cos(2 * Math.PI * random());
}
