import path from 'node:path';

function integer(env, key, fallback, min, max) {
  const value = Number(env[key] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}

export function configFromEnv(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const aiEnabled = env.AI_ENABLED === 'true';
  if (env.AI_ENABLED && !['true', 'false'].includes(env.AI_ENABLED)) throw new Error('AI_ENABLED must be true or false');
  if (env.PRIVATE_GAME_PASSWORD && (env.PRIVATE_GAME_PASSWORD.length > 256 || !env.PRIVATE_GAME_PASSWORD.trim())) throw new Error('Invalid PRIVATE_GAME_PASSWORD');
  if (aiEnabled && !env.OPENAI_API_KEY) throw new Error('AI_ENABLED requires OPENAI_API_KEY');
  if (production && !env.PRIVATE_GAME_PASSWORD) throw new Error('Production requires PRIVATE_GAME_PASSWORD');
  if (production && aiEnabled && (!env.DATA_DIR || !path.isAbsolute(env.DATA_DIR))) {
    throw new Error('Production AI requires an absolute DATA_DIR on a persistent disk');
  }
  const origins = (env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map(s => s.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol)) throw new Error('ALLOWED_ORIGINS must contain exact origins');
  }
  return {
    production, aiEnabled, apiKey: env.OPENAI_API_KEY, password: env.PRIVATE_GAME_PASSWORD || '', origins,
    port: integer(env, 'PORT', 3000, 0, 65535),
    dataDir: path.resolve(env.DATA_DIR || 'data'), model: 'gpt-6-luna',
    dailyTokens: integer(env, 'DAILY_TOKEN_LIMIT', 50000, 1000, 1000000),
    dailyRequests: integer(env, 'DAILY_REQUEST_LIMIT', 100, 1, 1000),
    outputTokens: integer(env, 'MAX_OUTPUT_TOKENS', 220, 100, 400),
    maxRooms: integer(env, 'MAX_ROOMS', 10, 1, 50),
    shiftSeconds: integer(env, 'SHIFT_SECONDS', 300, 30, 600),
    reconnectMs: 45000,
  };
}
