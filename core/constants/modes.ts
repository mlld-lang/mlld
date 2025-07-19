export const MLLD_MODES = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  USER: 'user'
} as const;

export type MlldMode = typeof MLLD_MODES[keyof typeof MLLD_MODES];