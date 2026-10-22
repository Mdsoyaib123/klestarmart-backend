// Imported before any app module: config/env.ts reads the environment once, when it first loads.
export const STORE_ORIGIN = 'http://store.test'
export const ADMIN_ORIGIN = 'http://admin.test'

Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  CLIENT_URL: STORE_ORIGIN,
  DASHBOARD_URL: ADMIN_ORIGIN,
  API_PUBLIC_URL: 'http://api.test',
})
