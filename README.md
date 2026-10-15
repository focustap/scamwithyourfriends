# Cold Call Chaos

A single-file browser prototype for a fictional comedy call-center game. Inspired by the broad genre of conversational party sims, with original characters, UI, products, and dialogue.

## Play / Publish on GitHub Pages

1. Open this repo in GitHub.
2. Select **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose **main** and **/(root)**, then **Save**.
5. Visit the URL GitHub gives you (typically `https://focustap.github.io/scamwithyourfriends/` once Pages is enabled and deployed).

You can also download and open `index.html` directly. There is no build process or dependency installation.

## Current features

- Fictional callers with different styles, attitudes, and imaginary products
- Typed conversation with simulated, rule-based replies
- Browser text-to-speech for character voices
- Optional microphone transcription where Web Speech recognition is supported (generally Chrome/Edge; may not work in Firefox)
- Trust, suspicion, pitch and close-deal mechanics
- Earnings, quotas, five-minute shifts and recurring shift challenges
- Ledger, office files, handbook and settings

## Important limitations

This is a **solo prototype**. Characters are **scripted**, not GPT-powered. Publishing the static HTML on GitHub Pages does not provide a secure server, shared game state, or actual online multiplayer.

To add real GPT-6 Luna conversations, use a **separately hosted backend** to authenticate players, store the OpenAI API key, track a token budget, and authorize each request. **Never commit an API key to this public repository or embed it in client-side HTML.** GitHub Pages also cannot itself host the WebSocket server needed for synchronized multiplayer.

Text-to-speech is provided by the browser. Speech-recognition capability, privacy and processing depend on the browser; it may use an external recognition service.

The game is entirely fictional; it does not connect to real accounts or process real payments.

## Next steps

Implement the secure voice/LLM service and multiplayer server, then connect the browser client to those endpoints while retaining the simulated offline fallback.