// Artwork fit table — how much of its canvas each badge coin actually fills.
//
// The asset pipeline (scripts/admin/achievement-assets/) accepts a coin that
// covers 70–95 % of the frame, so the raw PNGs differ in size by up to 22 %:
// left uncompensated, a badge wall shows some coins clearly bigger than
// others. The medallion therefore scales every image by
//
//     CROP / radius
//
// so the coin always renders at the same size and the same 5 % rim crop.
//
// The numbers are measured from the shipped PNGs (alpha bounding disc) and a
// guard test re-measures them, so a regenerated asset cannot drift away from
// the table unnoticed.

/**
 * Coin radius per artwork, as a fraction of the canvas half-width
 * (0.5 = the coin touches the canvas edge, 1 = the canvas is the coin).
 */
export const ARTWORK_RADIUS: Record<string, number> = {
  big_day: 0.734,
  cache_alchemy: 0.758,
  cachekeeper: 0.731,
  fleet: 0.76,
  marathon_session: 0.797,
  marathoner: 0.791,
  model_symphony: 0.697,
  multitool: 0.711,
  night_owl: 0.744,
  polyglot: 0.82,
  project_devotion: 0.799,
  project_hopper: 0.762,
  streak: 0.727,
  sync_diligence: 0.731,
  token_titan: 0.848,
  veteran: 0.791,
  weekend_warrior: 0.807,
  wordsmith: 0.791,
};

/** Fraction of the coin's diameter that the tier ring cuts away. */
export const ARTWORK_CROP = 0.05;

/**
 * Scale for one artwork: how much to zoom the image so the coin fills the
 * medallion frame plus the crop. Unknown ids fall back to 1 (no zoom).
 */
export function artworkScale(id: string, crop = ARTWORK_CROP): number {
  const radius = ARTWORK_RADIUS[id];

  if (!radius) return 1;

  return (1 + crop) / radius;
}
