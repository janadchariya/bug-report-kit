/** Supply these in the shell/CI; this file never reads a copied .env file. */
export const E2E_ENV = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  APP_ENVIRONMENT: 'local',
};
