// Local static preview under the same nested path GitHub Pages uses.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), app = express();
app.get('/scamwithyourfriends/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
// The public config.js correctly points real players to Render.
// Browser E2E tests MUST use the disposable local test server instead,
// otherwise they contact production, fail CORS and cannot enter a room.
app.get('/scamwithyourfriends/config.js', (_req, res) => {
  res.type('application/javascript').send("window.COLD_CALL_CONFIG = { backendUrl: 'http://127.0.0.1:3000' };\n");
});
app.use('/scamwithyourfriends/assets', express.static(path.join(root, 'assets')));
app.listen(4173, '127.0.0.1', () => console.log('Static preview: http://127.0.0.1:4173/scamwithyourfriends/'));
