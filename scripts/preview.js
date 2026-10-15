// Local static preview under the same nested path GitHub Pages uses.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), app = express();
app.get('/scamwithyourfriends/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.get('/scamwithyourfriends/config.js', (_req, res) => res.sendFile(path.join(root, 'config.js')));
app.use('/scamwithyourfriends/assets', express.static(path.join(root, 'assets')));
app.listen(4173, '127.0.0.1', () => console.log('Static preview: http://127.0.0.1:4173/scamwithyourfriends/'));
