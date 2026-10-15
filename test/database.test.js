import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

// CI uses independent real PostgreSQL connections; local runs can use the same
// PostgreSQL SQL/PLpgSQL engine compiled to WASM when Docker is unavailable.
test('PostgreSQL accounting, privileges, reservations and settlement', async t => {
  let db;
  if (process.env.TEST_DATABASE_URL) {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Tests may only use a local disposable database');
    db = new pg.Pool({ connectionString:process.env.TEST_DATABASE_URL,max:20 });
  } else db = new PGlite();
  t.after(() => db.end ? db.end() : db.close());
  const query = async (sql,params) => db.exec && !params ? (await db.exec(sql)).at(-1) : db.query(sql,params);
  await query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
  end $$;`);
  // Local disposable database only. Production migration is deliberately non-destructive.
  await query('drop schema if exists game_private cascade');
  for (const name of ['npc_usage_status()','npc_reserve(uuid,integer,text,text,integer)','npc_settle(uuid,integer,integer,integer)','npc_fail(uuid)']) await query('drop function if exists public.' + name);
  const migration = fs.readdirSync('supabase/migrations').find(n => n.endsWith('_npc_dialogue_accounting.sql'));
  const sql = fs.readFileSync('supabase/migrations/' + migration,'utf8');
  if (db.exec) await db.exec(sql); else await query(sql);
  const status = async () => (await query('select public.npc_usage_status() as value')).rows[0].value;
  const reserve = (id = randomUUID(),tokens = 6000) => query('select public.npc_reserve($1,$2,$3,$4,$5) as value',[id,tokens,'a'.repeat(64),'mock',240]);
  await t.test('migration starts disabled, with distinct mock/live controls and private RPC permissions',async () => {
    assert.equal((await status()).blocked,true);
    await assert.rejects(reserve(),/AI_DISABLED/);
    const privileges = (await query("select has_function_privilege('anon','public.npc_usage_status()','execute') as anon, has_function_privilege('service_role','public.npc_usage_status()','execute') as server, has_schema_privilege('authenticated','game_private','usage') as exposed")).rows[0];
    assert.deepEqual(privileges,{ anon:false,server:true,exposed:false });
    const rows = (await query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='game_private' and c.relkind='r' and c.relrowsecurity")).rows[0]; assert.equal(rows.n,3);
  });
  await query('update game_private.ai_control set enabled=true,daily_requests=1');
  await t.test('concurrent reservations cannot bypass the one-request daily ceiling',async () => {
    const results = await Promise.allSettled(Array.from({ length:20 },() => reserve()));
    assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
    assert.equal((await status()).requests,1); assert.equal((await status()).tokens,6000);
  });
  await query('truncate game_private.ai_reservations,game_private.ai_days; update game_private.ai_control set daily_requests=10,daily_tokens=10000');
  await t.test('token reservations prevent overspend, duplicates are rejected, settlement is idempotent',async () => {
    const id = randomUUID(); await reserve(id);
    await assert.rejects(reserve(id),/DUPLICATE_REQUEST/); await assert.rejects(reserve(),/DAILY_BUDGET/);
    await query('select public.npc_settle($1,800,100,900)',[id]);
    assert.equal((await status()).tokens,900);
    await query('select public.npc_settle($1,0,0,0)',[id]); assert.equal((await status()).tokens,900);
    const second = randomUUID(); await reserve(second); await query('select public.npc_fail($1)',[second]);
    assert.equal((await status()).tokens,6900);
  });
  await t.test('active reservations enforce concurrency without refunding crashed calls',async () => {
    await query('truncate game_private.ai_reservations,game_private.ai_days; update game_private.ai_control set daily_tokens=50000');
    await reserve(); await reserve(); await assert.rejects(reserve(),/RATE_LIMIT/);
    await query("update game_private.ai_reservations set created_at=created_at-interval '31 seconds'");
    await reserve(); assert.equal((await status()).tokens,18000);
  });
  await t.test('late usage settles original UTC day and over-reservation trips a durable breaker',async () => {
    await query('truncate game_private.ai_reservations,game_private.ai_days'); const id = randomUUID(); await reserve(id);
    await query("insert into game_private.ai_days(day,mode,tokens,requests) select day-1,mode,tokens,requests from game_private.ai_days");
    await query('update game_private.ai_reservations set day=day-1');
    await query("update game_private.ai_days set tokens=0,requests=0 where day=(clock_timestamp() at time zone 'UTC')::date");
    await query('select public.npc_settle($1,800,100,900)',[id]);
    assert.equal((await status()).tokens,0);
    const previous = (await query('select tokens from game_private.ai_days where day=(select min(day) from game_private.ai_days)')).rows[0]; assert.equal(Number(previous.tokens),900);
    const excess = randomUUID(); await reserve(excess); await query('select public.npc_settle($1,7000,100,7100)',[excess]);
    await assert.rejects(reserve(),/DAILY_BUDGET/);
  });
});
