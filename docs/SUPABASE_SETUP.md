# Manual Supabase deployment: `cold-call-chaos`

Use the Dashboard signed into the **separate account that owns this project**. No Supabase account linking, cloud migration, Edge deployment, secret access or paid model call has been performed by this PR. Do not paste credentials into GitHub, chat, SQL, `config.js`, or the browser game.

## 1. Apply the database migration while AI stays off

1. Open [Supabase Dashboard](https://supabase.com/dashboard), select **cold-call-chaos**, and confirm the project reference in the URL. Do not select a similarly named project in another account.
2. Open **SQL Editor → New query**. Paste the entire committed file `supabase/migrations/20261015213048_npc_dialogue_accounting.sql`. Run it as **postgres**. It is a single transaction and creates fresh tables/functions; apply it once. Keep the filename in your deployment notes, because manually running SQL does not populate CLI migration history.
3. The migration sets `enabled=false`, `mode='mock'`, `allow_live=false`, and **one request per mode per UTC day**. It makes no OpenAI request.
4. Run the following read-only verification query:

```sql
select enabled, mode, allow_live, daily_tokens, daily_requests,
       per_minute, concurrent_requests, output_tokens
from game_private.ai_control;

select public.npc_usage_status();

select has_function_privilege('anon', 'public.npc_reserve(uuid,integer,text,text,integer)', 'execute') as anon_can_reserve,
       has_function_privilege('authenticated', 'public.npc_usage_status()', 'execute') as users_can_read,
       has_function_privilege('service_role', 'public.npc_usage_status()', 'execute') as edge_can_read;
```

Expected: disabled/mock/no-live; 50,000 tokens; one request; 6 requests/minute; two concurrent requests; 320 output tokens. Permissions must be **false, false, true**. All three private tables have RLS enabled; no browser roles have policies or grants. RPCs use `SECURITY INVOKER`, an empty search path, and service-role-only execution.

5. In **Project Settings / Integrations → Data API**, verify the Data API is enabled and `public` is an exposed schema. Keep **game_private out of exposed schemas**. Only the Edge Function's internal service identity can call the four accounting RPCs. The browser never uses Supabase keys or these RPCs.

## 2. Confirm secrets in Supabase only

Open **Edge Functions → Secrets** for this project:

- Keep the existing `OPENAI_API_KEY`. Do not copy it to Render or local files.
- Set `GAME_SERVER_TOKEN` to a cryptographically random value of **at least 32 characters**. A 32-byte random value encoded as hex is suitable. Keep a private copy for the Render environment.
- Supabase automatically supplies `SUPABASE_URL` and its internal database credentials. The code prefers the modern `SUPABASE_SECRET_KEYS.default` if available and otherwise uses the platform-provided `SUPABASE_SERVICE_ROLE_KEY`. Do not put those database credentials on Render or in the browser.

The game-server token authenticates only this handler; it is not an OpenAI key, a Supabase user JWT, or the password players enter to join the office. If it leaks, rotate it in Supabase **and** Render immediately.

## 3. Deploy `npc-dialogue` via the Dashboard editor

1. Open **Edge Functions → Deploy a new function → Via Editor** (the official [Dashboard quickstart](https://supabase.com/docs/guides/functions/quickstart-dashboard)).
2. Name the function **npc-dialogue**. Replace the editor's `index.ts` contents with the **entire** file `supabase/dashboard/npc-dialogue.ts` from this branch. This is a generated, self-contained version of the tested source; it needs no imports or package installation. Do not paste only the small CLI `index.ts` entrypoint.
3. Deploy the function. Its URL will be `https://<PROJECT_REF>.supabase.co/functions/v1/npc-dialogue`.
4. In the function's **Details / Settings**, turn off **Verify JWT with legacy secret** (also labeled **Enforce JWT verification** in some Dashboard versions). The game-server token is not a Supabase JWT. This switch changes the gateway check; the function itself still requires the exact private bearer token on every request, including status requests. Missing/wrong tokens return 401. Any browser `Origin` header returns 403. There are no public CORS or OPTIONS responses.
5. Check the function is named exactly `npc-dialogue`. Leave the SQL control row disabled. The committed CLI config has `verify_jwt=false` for the same reason. See [Supabase authorization headers](https://supabase.com/docs/guides/functions/auth-headers).

Keep source changes in Git; Dashboard edits have no Git rollback. After changing `handler.js`, run `npm run build:edge`, commit the updated Dashboard bundle, and paste that full file again. `npm run check` rejects a stale bundle.

## 4. Configure Render Free

Import `render.yaml` after merging, or select this branch when creating the web service. It uses **plan: free** and has **no persistent disk**. For manual creation: Node 22, build `npm ci --omit=dev`, start `npm start`, health check `/health`.

Set these in Render's **Environment** panel:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `AI_ENABLED` | `false` initially |
| `SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` (origin only) |
| `GAME_SERVER_TOKEN` | Same private value stored in Supabase Secrets |
| `PRIVATE_GAME_PASSWORD` | Different random password shared only with your players |
| `ALLOWED_ORIGINS` | `https://focustap.github.io` plus any additional frontend HTTPS origins, comma-separated, no paths/trailing slashes |

**Delete any old `OPENAI_API_KEY` from Render.** Node refuses to start if one is present. No Supabase service-role key belongs on Render. Remove old `DATA_DIR` and Render daily-budget variables; limits are now controlled in PostgreSQL. The blueprint can generate the private player password; retrieve it privately from Render's Environment panel.

Render Free can spin down while idle, has resource limits, and has no persistent filesystem ([Render Free documentation](https://render.com/docs/free)). A restart or redeploy ends active in-memory rooms. Supabase reservations, token totals and limits survive independently. Keep one Node instance; rooms are not designed for horizontal scaling. Choose Free for the existing service manually if its previous plan was paid, and remove the old disk only after you no longer need its old ledger. Changing this file does not itself migrate a running service.

## 5. Test authorization and mock mode before a real call

On your own computer, use Node 22 and a **private, ignored `.env`** copied from `.env.example`. Put only `SUPABASE_URL` and `GAME_SERVER_TOKEN` there (plus the local game configuration); **no OpenAI key**. Do not pass tokens as command arguments or paste commands containing them into terminal history.

```sh
npm ci
npm run check
npm test
node scripts/ai-smoke.js --auth-probe
node scripts/ai-smoke.js --status
```

The probes must report **401 for a wrong token and 403 for a browser origin**. Status must show disabled/mock. These actions make no model request. If a probe fails, stop; leave AI disabled and correct the deployed source and auth setting.

In the SQL Editor enable **mock mode only**:

```sql
update game_private.ai_control
set enabled=true, mode='mock', allow_live=false,
    daily_requests=1, daily_tokens=50000
where id=true;
```

Then run once:

```sh
node scripts/ai-smoke.js --mock-once
```

Expected: `[MOCK]` response, `Supabase mock` mode, one mock request recorded, zero reported input/output model tokens, and no OpenAI request. A second mock request is rejected by the database. Mock mode deliberately does not score meaningful persuasion or make sales; offline practice is separate. The smoke script also insists on the one-request limit and does not retry. Do not delete reservation rows to repeat a test.

## 6. First real Luna call: one request, private terminal

Keep Render `AI_ENABLED=false` and do not run a multiplayer shift during this test. In SQL Editor:

```sql
update game_private.ai_control
set enabled=true, mode='live', allow_live=true,
    daily_requests=1, daily_tokens=50000, output_tokens=320
where id=true;
select public.npc_usage_status();
```

Confirm the **live** UTC bucket has zero requests. Mock usage is in a separate bucket. Run exactly once locally:

```sh
node scripts/ai-smoke.js --live-once
```

The script checks live mode, an open budget, zero previous live requests, a daily request ceiling of exactly one and a token limit no larger than 50,000. It sends Doug's profile, memory/context and one player question to the protected function. It prints only the response mode, NPC reply and usage counts, never credentials. Expected mode: **GPT-5.6 Luna**, with an answer to the actual question about his flamingos. Even if the provider times out or returns invalid output, no retry occurs and the reservation remains charged where usage is unknown. Another request cannot pass the one-request ceiling.

Immediately disable live calls again:

```sql
update game_private.ai_control set enabled=false, allow_live=false where id=true;
select day, mode, tokens, requests, input_tokens, output_tokens, blocked
from game_private.ai_days order by day desc, mode;
select request_id, day, mode, reserved_tokens, charged_tokens, state, created_at
from game_private.ai_reservations order by created_at desc limit 10;
```

If the output is truncated, the error stays visible and known usage is still accounted for. Do not reset counts or automatically repeat. Check model access and output/latency before planning another controlled call, respecting the original reservation. The `tokens` counter includes unresolved reservations, so it can exceed reported input/output usage.

## 7. Enable a small private playtest only after the smoke check

When you choose to permit a session, set a small explicit request ceiling appropriate for your group, for example:

```sql
update game_private.ai_control
set mode='live', allow_live=true, enabled=true,
    daily_requests=30, daily_tokens=50000, per_minute=6, concurrent_requests=2
where id=true;
```

Then set Render `AI_ENABLED=true` and restart the service. Never raise limits from a browser. To halt paid work, set `enabled=false` in SQL first; then turn Render AI off. Requests already reserved/in flight can still bill.

Configure the public `config.js` with the Render backend origin or enter it on the landing screen. Enable GitHub Pages from `main` / repository root after merge. Neither secret belongs in frontend configuration. Two Chrome/Edge clients can now test real microphone recognition and spoken replies. Verify mode labels, response relevance and accounting. Deny microphone permission once to check typed input.

## Accounting and failure behavior

`npc_reserve` locks the single control row and daily bucket in a transaction, checks global rate/concurrency and budgets, and inserts a unique request ID before OpenAI is called. Duplicate IDs are rejected, not retried. Reservation size is calculated inside the Edge Function from the request's UTF-8 bytes, schema/framing overhead and bounded output. Settlement is idempotent and charges the reservation's original UTC day even across midnight. Unknown failures keep the full reservation. A 30-second lease releases a crashed request's concurrency slot without refunding its tokens. Reported usage above reservation trips a durable daily breaker.

No conversation text or profiles are stored in accounting tables. A SHA-256 payload digest identifies the reservation; it is not an anonymous-data guarantee. Node holds bounded customer memory and recent turns for the room lifetime, including between shifts; it resets when the room/server ends. GPT receives the profile, bounded memory, recent history and current words each turn. No raw model score, hangup flag, sale, or reward is accepted from the browser.

Service-role secrets bypass RLS and must remain in Supabase's runtime. This app's limits cover this function and project ledger, not other uses of your OpenAI key or an account-wide dollar cap. Use a dedicated OpenAI project and its available billing controls. Supabase Free quotas and availability remain subject to the platform's limits; failed accounting prevents a model call.


## Token-efficient dialogue

The live model is **GPT-5.6 Luna**, the modern nano-tier model. The Edge prompt asks for short NPC replies (35 words maximum), a compact assessment and at most two concrete memory facts. The Node server sends the previous six non-system chat messages, bounded durable memory and the current message. A new model request still resends these fields; memory is stored in the room on Render, not inside OpenAI. Model maximum output is capped at 280 tokens even if the SQL `output_tokens` setting is higher. Both request and token budgets continue to apply. This reduces average token use but does not guarantee a particular cost, token count, or complimentary API allowance.
