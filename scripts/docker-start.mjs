import {access,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync,spawn} from 'node:child_process';
let initialized=false;try{await access('.wrangler/steam-lens-schema-v1');initialized=true;}catch{}
if(!initialized){const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','drizzle/0000_tearful_chronomancer.sql'],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);await mkdir('.wrangler',{recursive:true});await writeFile('.wrangler/steam-lens-schema-v1','applied');}
const child=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip','0.0.0.0','--port','8787','--inspector-port','0'],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??0));
