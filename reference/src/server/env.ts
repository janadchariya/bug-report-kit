import 'server-only';
export const serverEnv = {
  get DATABASE_URL(): string { const value = process.env.DATABASE_URL; if (!value) throw new Error('DATABASE_URL_required'); return value; },
  get AUTH_SECRET(): string { const value = process.env.AUTH_SECRET; if (!value || value.length < 32) throw new Error('AUTH_SECRET_32_chars_required'); return value; },
  get APP_ENVIRONMENT(): string { return process.env.APP_ENVIRONMENT ?? 'local'; },
};
