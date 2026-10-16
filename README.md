# Cold Call Chaos

Private multiplayer comedy for 2–4 friends. Use your own spoken or typed words to pitch ridiculous fictional products, answer character-specific objections, repair simulated customer computers and meet a shared quota.

The frontend stays static for GitHub Pages. Node/Socket.IO owns private rooms, shifts and all rewards on **Render Free**. Supabase `npc-dialogue` alone holds the OpenAI key, calls **GPT-5.6 Luna Responses**, and uses PostgreSQL for atomic daily budgets. No paid Render disk is needed.

## Start locally

Use Node 22. Run `npm ci`, copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell), then `npm start`. Open `http://localhost:3000` in two browsers/profiles, create/join a room, and let the host start the shift.

AI is disabled by default. Offline **Practice** is explicitly labeled and requires relevant explanations rather than repeated compliments. It never runs after a failed AI request. With Supabase configured, mock replies are also labeled; rejected AI turns show an error, grant no trust, and do not substitute canned NPC speech.

## Supabase and Render setup

Follow **[the exact Dashboard deployment and safe first-call procedure](docs/SUPABASE_SETUP.md)**. It covers the separate Supabase account, SQL migration, single-file Dashboard function, secrets, auth probes, mock check, one-request live test, and Render Free configuration.

- Supabase only: `OPENAI_API_KEY` and its internal database credentials.
- Supabase + Node/Render only: matching private `GAME_SERVER_TOKEN`.
- Node/Render only: `PRIVATE_GAME_PASSWORD` for players; `AI_ENABLED=false` until ready.
- Public frontend: `config.js` contains only the Render backend origin. Publish Pages from `main` / root after merge.

The migration starts disabled, in mock mode, with live calls disallowed and one request per mode/day. A source commit does not deploy or enable anything. Node rejects an OpenAI key in its environment. The [official model docs](https://developers.openai.com/api/docs/models/gpt-5.6-luna) confirm `gpt-5.6-luna` with `reasoning.effort: "none"`; the Edge Function uses Responses structured output, `store:false`, no tools and no automatic retries.

## Gameplay and desktop

Every NPC has a name, age, occupation, background, personality, humor, speech style, three personal concerns, and bounded memory. Profiles, the last ten messages, and the current words go to the model on each turn. The server also provides the IDs of previously credited concerns so the NPC knows what remains unresolved. The NPC still judges each statement, keeps memories, and decides whether to agree; the server independently validates the assessment before scoring. Memory stays with the room across shifts and resets when the server/room ends.

Trust requires a grounded answer to a concern: first relevant contribution +12, a distinct follow-up +4, then no more. Repeated pitches earn nothing and increase suspicion. Discovery can add +3 once. A repaired computer adds +7 once. Sales require trust >=65, suspicion <60, three successful turns, two answered concerns, customer agreement, and a verified computer. The server validates scoring, hangups, puzzles, money and duplicate rewards.

Drag application title bars; minimize, maximize, close and restore from the taskbar. Phone, Operations, Computer, File Explorer, Sales Ledger, Calculator, Notepad, Settings and Handbook are separate apps. Terminal supports `scan`, `repair MODULE`, `status`, `ls` and `cat concerns.txt`; it never executes real commands. Repair the module, restore the router sequence, then calculate and verify an itemized invoice. Teammates can work on your computer while you talk. Calculator is an arithmetic parser, not `eval`. Notepad stays in that browser tab and is not sent to the model.

## Free voice

**TALK** uses browser recognition; pause or press STOP to send final words. Browser `speechSynthesis` supplies NPC voices immediately. Hands-free mode resumes after an NPC reply; headphones prevent echo. Desktop Chrome/Edge on HTTPS or localhost generally support recognition; typed input remains available. Recognition may use the browser vendor's servers. The game sends transcripts, not recordings, to its backend.

Settings offers an explicit **Download & enable Kokoro** option. It loads pinned `kokoro-js@1.2.1` from jsDelivr and a quantized Kokoro-82M model from Hugging Face, then generates speech locally in a WASM worker. This is a large optional download, can take minutes, and performance varies by browser/hardware. Loading/generation errors visibly select browser voices. Interruptions discard obsolete audio. No paid voice API or Render inference is involved. See [Kokoro.js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js). The static game works without these external assets unless you opt into Kokoro.

## Limits and availability

Persistent token/request reservations, rate and concurrency limits live in PostgreSQL. Byte-based conservative reservations are made before requests; known usage settles once; failures with unknown usage remain charged. Requests crossing midnight settle the original UTC day. Mock/live buckets are distinct. See the setup guide for administrator controls and security verification.

Defaults: 50,000 tokens/day, **one request/day until explicitly raised**, 6 requests/minute globally, 2 in flight, 320 output tokens, nine-second provider timeout, zero retries. Node additionally limits turns per player/room, input length, active rooms and Socket.IO payloads. Budgets are application token limits, not account-wide dollar caps.

Render Free may sleep or restart; active rooms are in memory and end on restart. Durable accounting survives in Supabase. Reconnecting players have a 45-second grace period; the host role transfers after expiry. Keep one Node instance. No player-to-player voice chat is included.

## Tests

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

Backend tests cover the protected Edge handler with mocked model/REST responses, server-only integration, evidence/repetition scoring, secret boundaries, real Socket.IO rooms and PostgreSQL migration/accounting. Without Docker, local database tests use PostgreSQL compiled to WASM (PGlite); CI uses independent PostgreSQL 17 connections for concurrent reservation tests. No tests call a deployed project or paid model. Dashboard bundle parity is checked by `npm run check`; regenerate with `npm run build:edge`.

Browser tests cover microphone/speech callbacks, cooperative terminal/router/invoice repair, shared sales, reconnect/shift behavior, window dragging/restoring, Calculator/Notepad and narrow-screen fallback under the Pages subdirectory. Speech providers are mocked. Actual microphone quality, Kokoro model generation, GPT response quality and hosted latency still require the manual opt-in smoke procedure; they have not been validated by these automated tests.


## Negotiation and software upgrades

NPC list prices are now affordable fictional opening offers (Mildred $150); negotiated prices influence AI willingness, and the final agreed number determines the server-verified sale payout. Quotes between 50% and 200% of the list price can close after genuine NPC agreement. Lower prices tend to be easier but earn less; markups may be harder but earn more. For two players the initial shift quota is $400; each extra player adds $100 and later shifts add $70, capped at $900.

The OS desktop now has wallpaper shortcuts, a Start launcher and windowed Phone, Computer, Ledger, File Explorer, Help, App Store, Vault Lab and other tools. Server-held team credits accumulate from sales and bonus jobs, and buying apps never subtracts from shift progress. Buy SSD Extractor ($80) and Wallet Cipher ($160) to unlock fictional badge/PIN extraction mini-games on verified customer computers ($30/$75 once per target). These interact only with invented game state: no real SSDs, wallets, keys, devices or accounts are accessed. Room upgrades persist through shifts only until the Render room ends.

To update a live deployment, redeploy the Render server from main and then paste the entire matching `supabase/dashboard/npc-dialogue.ts` bundle into the Supabase `npc-dialogue` Edge Function editor. No SQL change or new secrets are required.


## Solo shifts and closing risks

One player can start immediately with a $230 initial quota. 2–4-player rooms remain supported. The phone shows an explicit sales goal and three clear PRICE / BENEFIT / TRUST marks with character-specific hints. A customer still needs a relevant answer for each mark. The optional computer repair adds trust and ten points to the closing-odds formula. Deals can be attempted at any time for a server-side 3–95% success chance, without a model request; failed attempts cost 4 trust and add 8 suspicion. Each call gets at most three closing rolls and one per conversation turn. The UI removes repetitive out-of-universe disclaimers; the backend remains confined to generated game data and never accesses device contents or real wallets.


## Three-day quota runs and customer rotation

Every quota lasts **three five-minute days**. Each day shows five distinct random callers from the 35-character pool, without repeats within that quota. The starting quota is $600 for one player, $1,000 for two, and +$300 per additional player. Sales, optional computer jobs and bonus apps increase the shared cash bank; installing software spends that same bank, so spending can prevent a quota from clearing. The amount due is deducted only at the **end of Day 3**. Meeting it carries any surplus into the next quota and increases the target by 45%; missing it resets to Quota 1, Day 1, empty cash and no purchased upgrades. Day-end results remain visible before the host starts the next day. The team may end a day early, but that still advances the deadline.

Apps: SSD Extractor and Wallet Cipher open recovery jobs; Commission Booster costs $180 for +20% on successful sales; Turbo Recovery costs $260 and doubles recovery job rewards. These apply to server-verified earnings, not player-supplied amounts.

## Lean NPC input

The Node-to-Edge request now includes four recent conversation messages (two exchanges), the three latest durable memories, the customer identity/personality condensed to bounded strings, three specific objections, and prices, credited criteria and trust state. The Edge prompt is shortened while retaining strict structured persuasion judgments. Actual token savings depend on conversation and should be checked in Supabase settled input/output counts or OpenAI usage; no claimed fixed 500-token usage per reply. The OpenAI usage dashboard may update later than the game accounting display.
