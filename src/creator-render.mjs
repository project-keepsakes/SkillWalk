import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {bundleCreatorHTML} from './creator-materials.mjs';
import {artifactIssues} from './artifact.mjs';
import {ensureSandboxProfile} from './sandbox-profile.mjs';
import {root,sha256,json} from './util.mjs';
const exec=promisify(execFile);
export async function inspectCreatorRender(entry,files,output) {
  const html=bundleCreatorHTML(entry,files),issues=artifactIssues(html);
  if(issues.length)throw Error('Creator reference cannot run in the offline browser: '+issues.join('; '));
  await fs.writeFile(path.join(output,'source-reference.html'),html);
  const profile=await ensureSandboxProfile();
  const docker=process.env.DOCKER_BIN||'docker.exe', name='skillwalk-reference-'+randomUUID();
  try {await exec(docker,['run','--rm','--name',name,'--network','none','--read-only','--cap-drop','ALL','--cap-add','SYS_CHROOT','--security-opt','no-new-privileges','--security-opt','seccomp='+profile,'--user','pwuser','--memory','2g','--cpus','2','--pids-limit','128','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=536870912',
    '--mount',`type=bind,source=${path.join(root,'node_modules')},target=/app/node_modules,readonly`,
    '--mount',`type=bind,source=${path.join(root,'src/creator-render-browser.mjs')},target=/app/browser.mjs,readonly`,
    '--mount',`type=bind,source=${path.join(output,'source-reference.html')},target=/input/source-reference.html,readonly`,
    '--mount',`type=bind,source=${output},target=/output`,'-w','/app','mcr.microsoft.com/playwright:v1.64.0-noble','node','browser.mjs'],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  } finally {await exec(docker,['rm','-f',name],{windowsHide:true,timeout:15000}).catch(()=>{});}
  const facts=JSON.parse(await fs.readFile(path.join(output,'source-reference-facts.json'),'utf8'));
  const result={...facts,entry:entry.id,revision:entry.revision,collection:entry.collection,htmlHash:sha256(html),screenshotHash:sha256(await fs.readFile(path.join(output,'source-reference.png')))};
  await json(path.join(output,'source-reference-facts.json'),result);
  return result;
}
