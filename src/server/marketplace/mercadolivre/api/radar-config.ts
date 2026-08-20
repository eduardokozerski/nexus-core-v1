import { MERCADO_LIVRE_DIMENSION_SEEDS } from "./dimension-seeds";

// The official /highlights endpoint exposes the top 20 entries per category.
export const RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION = 20;
export const RADAR_MAX_CANDIDATES_PER_DOMAIN = 5;
export const RADAR_MAX_CANDIDATES_AFTER_DIVERSITY = 240;

export const RADAR_DIMENSIONS = MERCADO_LIVRE_DIMENSION_SEEDS
  .filter((dimension) => dimension.radarEnabled)
  .sort((left, right) => left.portfolioPriority - right.portfolioPriority);
