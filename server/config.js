
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
  if (env.OPENAI_API_KEY) throw new Error('Remove OPENAI_API_KEY from Node/Render; configure it only in Supabase');
  let functionUrl = '';
  if (aiEnabled) {
    if (!env.GAME_SERVER_TOKEN || env.GAME_SERVER_TOKEN.length < 32) throw new Error('AI_ENABLED requires a private GAME_SERVER_TOKEN of at least 32 characters');
    const url = new URL(env.SUPABASE_URL || '');
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('SUPABASE_URL must be the HTTPS project origin');
    functionUrl = url.origin + '/functions/v1/npc-dialogue';
  }
  if (production && !env.PRIVATE_GAME_PASSWORD) throw new Error('Production requires PRIVATE_GAME_PASSWORD');
  const origins = (env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map(s => s.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol)) throw new Error('ALLOWED_ORIGINS must contain exact origins');
  }
  return {
    production, aiEnabled, functionUrl, gameServerToken: env.GAME_SERVER_TOKEN, password: env.PRIVATE_GAME_PASSWORD || '', origins,
    port: integer(env, 'PORT', 3000, 0, 65535),
    maxRooms: integer(env, 'MAX_ROOMS', 10, 1, 50),
    shiftSeconds: integer(env, 'SHIFT_SECONDS', 300, 30, 600),
    reconnectMs: 45000,
  };
}
