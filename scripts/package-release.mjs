import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();
for(const file of ['dist/server/index.js','dist/server/wrangler.json','dist/.openai/hosting.json','dist/.openai/drizzle/meta/_journal.json']){
 if(!existsSync(path.join(root,file)))throw Error('Missing build output: '+file+'. Run npm run build first.');
}
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
const built=JSON.parse(readFileSync('dist/.openai/hosting.json','utf8'));
if(JSON.stringify(manifest)!==JSON.stringify(built))throw Error('Hosting settings changed after building. Rebuild before packaging.');
let commit=null,dirty=true;
try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();}catch{}
if(process.env.GITHUB_ACTIONS==='true'&&(!commit||dirty||commit!==process.env.GITHUB_SHA))throw Error('CI packaging requires the exact clean checked-out commit.');
mkdirSync('.release',{recursive:true});
const archive=path.resolve('.release/bituach-beklik.tar.gz');
execFileSync(process.platform==='win32'?'tar.exe':'tar',['-czf',archive,'-C',root,'dist'],{stdio:'inherit',windowsHide:true});
const entries=execFileSync(process.platform==='win32'?'tar.exe':'tar',['-tzf',archive],{encoding:'utf8'}).split(/\r?\n/);
if(!entries.includes('dist/.openai/hosting.json')||!entries.includes('dist/server/index.js'))throw Error('Incomplete deployment archive.');
const release={schema_version:1,project_id:manifest.project_id,commit_sha:commit,source_dirty:dirty,artifact:'bituach-beklik.tar.gz',artifact_sha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),built_at:new Date().toISOString(),node:process.version};
writeFileSync('.release/release.json',JSON.stringify(release,null,2)+'\n');
console.log('Release package: .release/bituach-beklik.tar.gz');
console.log(commit&&!dirty?'Verified source commit: '+commit:'Local package only: commit the source and rebuild from that commit before publishing.');
