import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync('node_modules/socket.io/client-dist/socket.io.min.js', 'utf8');
writeFileSync('assets/socket.io.min.js', source.replace(/^\/\/# sourceMappingURL=.*$/m, '').trimEnd() + '\n');
copyFileSync('node_modules/socket.io/LICENSE', 'assets/socket.io.LICENSE.txt');
