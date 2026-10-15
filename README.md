# Cold Call Chaos

A private co-op comedy call-center game for **2–4 players**. Pitch ridiculous products to fictional customers, fix their simulated computers, and meet a shared five-minute sales quota. The existing desktop, original characters, trust/suspicion, ledger and shift progression are preserved. The original standalone solo game remains in `prototype.html`.

The static frontend runs on GitHub Pages. A separate Node.js / Socket.IO server owns rooms, customer lines, money, timers, puzzles and quotas. When enabled, **GPT-6 Luna** powers dialogue through the **OpenAI Responses API**. Browser recognition and speech synthesis provide microphone input and NPC speech without paid audio API calls.

## Local setup — no key needed

Use Node.js 22 LTS (20.10+ also works).

```sh
npm ci
```

Copy `.env.example` to `.env`: `Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on macOS/Linux. Then:

```sh
npm start
```

1. Open `http://localhost:3000` in two separate browsers or browser profiles. Duplicated tabs can inherit session storage; separate browsers are clearest.
2. Choose different desk names. Create a room in the first browser; enter that code and select **JOIN ROOM** in the second.
3. The host starts the shift. Each desk can call a different customer. New players join between shifts; existing desks can reconnect mid-shift.
4. Talk or type to build rapport. Open **Computer** to solve the boot sequence and invoice puzzles. A teammate can fix your computer while you talk.
5. Close a deal with trust >=65, suspicion <60, two completed conversation turns and a verified computer. Sales contribute to the shared quota.

`AI_ENABLED=false` is the default. This uses clearly labeled local dialogue with fully working multiplayer, voice, computer puzzles, events and sales. The archived `prototype.html` still works offline as the original solo game. The multiplayer client requires the backend.

## Enable your OpenAI project key

Set these **only in your private `.env` or Render environment**, never in `config.js`, HTML, GitHub Pages, a URL, or Git commits:

```dotenv
OPENAI_API_KEY=your-project-key-here
AI_ENABLED=true
```

Restart the backend. The fixed model identifier is `gpt-6-luna`; your project must have model access. No automatic model substitution occurs. The [official model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) lists Responses support and `reasoning.effort: "none"`. The backend uses `store: false`, short structured replies, no tools, no automatic retries, and the last eight dialogue messages. See [Responses documentation](https://developers.openai.com/api/docs/guides/migrate-to-responses).

Customers have distinct personalities and a randomized personal preoccupation. The model reacts to the player's words and recent conversation, with bounded trust/suspicion changes. The server independently validates sales; the model never sets payouts. Greetings, puzzles and events do not call OpenAI. Provider errors, timeouts or budget limits activate labeled local dialogue so play continues.

## Deploy the backend to Render

Import `render.yaml` as a Render Blueprint **after merging the PR**, or select the development branch when creating a service manually. Deployment has not been performed for you.

The blueprint creates a **paid Starter web service and 1 GB persistent disk**. Browser speech is free to this application; hosting and text-model calls are separate expenses. A durable disk preserves usage limits across restarts. Render's free filesystem loses writes on restart/redeploy: [persistent-disk documentation](https://render.com/docs/disks). A free service can test multiplayer with AI disabled; keep AI disabled until durable storage is attached.

Manual settings:

| Setting | Value |
| --- | --- |
| Runtime | Node.js 22 |
| Build | `npm ci --omit=dev` |
| Start | `npm start` |
| Health check | `/health` |
| Instances | **1** |
| Disk mount | `/var/data` |
| `NODE_ENV` | `production` |
| `DATA_DIR` | `/var/data` |
| `ALLOWED_ORIGINS` | `https://focustap.github.io` |
| `PRIVATE_GAME_PASSWORD` | A long random password shared only with your friends |
| `OPENAI_API_KEY` | Your private project key, configured by you |
| `AI_ENABLED` | Start with `false`; switch to `true` when ready |

The blueprint generates a private-server password. Retrieve it from Render's environment panel and share it privately with players. Add the Render service's own HTTPS origin to `ALLOWED_ORIGINS` if you also want to play from its hosted frontend. Origins are comma-separated, with **no paths or trailing slashes**. Do not use `*`.

Render supplies `PORT`; the app listens on `0.0.0.0`. Socket.IO uses the same HTTP server/port, supports polling and WebSockets, and reconnects after network loss. See [Render WebSockets](https://render.com/docs/websocket). Automatic deploys are off in the blueprint to avoid interrupting shifts.

Rooms and sessions are in memory: restarting/deploying ends current games. The **daily usage ledger** persists on disk. Run one process and one instance only. Horizontal scaling would require shared game storage, a Socket.IO adapter and a transactional shared usage ledger.

## Deploy the frontend to GitHub Pages

1. After merging, select **Settings → Pages → Deploy from a branch → main → /(root)**.
2. In public `config.js`, set `backendUrl` to your service origin, e.g. `https://your-service.onrender.com`. This URL contains no secret. Alternatively players can paste it into the landing screen.
3. Visit `https://focustap.github.io/scamwithyourfriends/`, enter the private server password, and create/join a room.

There is no frontend build or CDN dependency. Relative asset paths support the repository subdirectory. The Socket.IO browser client and license are committed in `assets`; regenerate them with `npm run vendor` when upgrading Socket.IO. GitHub Pages cannot run the backend or store secrets.

## Voice and privacy

- **TALK** starts recognition. Pause or press **STOP** to submit final recognized words; interim words appear under the input. TALK interrupts NPC speech. Recognition ends on hangup, leave, disconnect or changing apps.
- NPC replies use `speechSynthesis`, assigning available voices and pitches per character. Settings controls playback, speed and optional **hands-free** mode, which listens after a spoken reply. Use headphones to prevent echo. Player-to-player audio chat is not included.
- Use desktop Chrome or Edge on HTTPS (or localhost). Support, recognition quality, permissions and voices depend on browser/OS. Recognition may send audio to the browser vendor's servers and is not guaranteed offline. Typed input remains available.
- The backend receives transcripts, not microphone recordings. With AI enabled, recent conversation text goes to OpenAI. Conversations stay in memory and are not written to the usage ledger. That file contains counts and reservation identifiers only.

## Spending controls and operations

| Variable / rule | Default |
| --- | --- |
| `AI_ENABLED` | `false` (explicit opt-in) |
| `DAILY_TOKEN_LIMIT` | 50,000 across the backend |
| `DAILY_REQUEST_LIMIT` | 100 across the backend |
| `MAX_OUTPUT_TOKENS` | 220 per response (configurable maximum 400) |
| Concurrent model requests | 2 globally |
| Model request rate | 12 per minute globally |
| Player / room turn rates | 6 / 16 per minute |
| Turn cooldown / call length | 1.2 seconds / 12 turns |
| API timeout / automatic retries | 9 seconds / zero |
| Provider-error circuit breaker | 60-second cooldown |
| `MAX_ROOMS` | 10 (4 players maximum each) |
| `SHIFT_SECONDS` | 300 |

Before each provider request, the server synchronously saves a conservative input/output token reservation to `DATA_DIR/usage.json`. Success replaces it with reported usage; ambiguous failures and crashes keep the full reservation charged. The daily bucket is **UTC**; requests spanning midnight settle against their original day. Reservations use UTF-8 input/schema bytes plus framing overhead and the output limit, so AI can pause before the displayed token maximum is reached. Failed requests count toward the request limit. Budget/storage failures fall back to local dialogue. Corrupt ledgers stop startup instead of silently resetting spending.

The operations console shows total charged/reserved tokens and daily request counts. The ledger also records reported input/output tokens separately. Keep it on the original persistent disk. Deleting it, restoring an older snapshot, changing `DATA_DIR` or running another backend with this key bypasses one service's accounting. This is a token/request cap for this app, **not an account-wide currency cap**. Use a dedicated project key, restrict access and configure the project's available limits/alerts. To stop new paid calls, set `AI_ENABLED=false` and restart; in-flight calls may still bill. Keep the ledger when doing so.

Production requires a private server password. Rejoin sessions use random bearer tokens in that browser tab's session storage; the password stays in memory. Room codes are invitations, not account authentication. Rate/payload limits and exact origin checks cover polling and WebSocket handshakes. Password holders can consume the shared budget, so use a trusted small group. Disconnected players keep their seat for 45 seconds, then their line releases and the host role transfers. Only static client files and `/health` are served over HTTP.

## Tests and first live check

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

Backend tests use real Socket.IO clients (up to four players) and mocked Responses calls. Browser tests run two independent clients through a complete sale, cooperative puzzles, speech callbacks, hands-free restart, reload/rejoin, shift progression and the GitHub Pages subdirectory path. A small-screen/unsupported-recognition case is included. Headless tests mock speech providers: they verify event wiring, not a physical microphone, audible voice quality or real GPT latency. No tests make paid model calls. CI runs on Node 22.

After configuring your key, do one real two-player call in Chrome/Edge: enable speech, grant mic permission, say something specific, confirm the NPC responds to it, then verify token counts update. Deny mic permission once and verify typing works. Confirm Render's ledger survives a restart before extended play. A real-key/audio-device smoke test remains necessary on your deployment.
