# Cold Call Chaos

Private multiplayer comedy for 2–4 friends. Use your own spoken or typed words to pitch ridiculous fictional products, answer character-specific objections, repair simulated customer computers and meet a shared quota.

The frontend stays static for GitHub Pages. Node/Socket.IO owns private rooms, shifts and all rewards on **Render Free**. Supabase `npc-dialogue` alone holds the OpenAI key, calls **GPT-6 Luna Responses**, and uses PostgreSQL for atomic daily budgets. No paid Render disk is needed.

## Start locally

Use Node 22. Run `npm ci`, copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell), then `npm start`. Open `http://localhost:3000` in two browsers/profiles, create/join a room, and let the host start the shift.

AI is disabled by default. Offline **Practice** is explicitly labeled and requires relevant explanations rather than repeated compliments. It never runs after a failed AI request. With Supabase configured, mock replies are also labeled; rejected AI turns show an error, grant no trust, and do not substitute canned NPC speech.

## Supabase and Render setup

Follow **[the exact Dashboard deployment and safe first-call procedure](docs/SUPABASE_SETUP.md)**. It covers the separate Supabase account, SQL migration, single-file Dashboard function, secrets, auth probes, mock check, one-request live test, and Render Free configuration.

- Supabase only: `OPENAI_API_KEY` and its internal database credentials.
- Supabase + Node/Render only: matching private `GAME_SERVER_TOKEN`.
- Node/Render only: `PRIVATE_GAME_PASSWORD` for players; `AI_ENABLED=false` until ready.
- Public frontend: `config.js` contains only the Render backend origin. Publish Pages from `main` / root after merge.

The migration starts disabled, in mock mode, with live calls disallowed and one request per mode/day. A source commit does not deploy or enable anything. Node rejects an OpenAI key in its environment. The [official model docs](https://developers.openai.com/api/docs/models/gpt-6-luna) confirm `gpt-6-luna` with `reasoning.effort: "none"`; the Edge Function uses Responses structured output, `store:false`, no tools and no automatic retries.

## Gameplay and desktop

Every NPC has a name, age, occupation, background, personality, humor, speech style, three personal concerns, and bounded memory. Profiles and the last ten messages plus the current words go to the model on each turn. Memory stays with the room across shifts and resets when the server/room ends.

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
