import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const dir of ['server','assets','scripts','supabase/functions/npc-dialogue']) {
  for (const name of fs.readdirSync(dir)) if (name.endsWith('.js')) execFileSync(process.execPath,['--check',`${dir}/${name}`],{ stdio:'inherit' });
}
execFileSync(process.execPath,['scripts/build-edge.js','--check'],{ stdio:'inherit' });
