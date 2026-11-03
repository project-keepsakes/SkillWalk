import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ensureSandboxProfile} from './sandbox-profile.mjs';
import {root, outputDir, verificationDir, sha256, json} from './util.mjs';

const profile = await ensureSandboxProfile();
await fs.mkdir(verificationDir, {recursive: true});
const hash = sha256(await fs.readFile(path.join(outputDir, 'website.html')));
const contractHash = sha256(await fs.readFile(path.join(outputDir,'plan.json')));
await json(path.join(verificationDir, 'generic-report.json'), {passed: false, checks: [], failure: 'Browser did not complete verification'});
const image = 'mcr.microsoft.com/playwright:v1.64.0-noble';
const args = [
  'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
  '--cap-add', 'SYS_CHROOT', '--security-opt', 'no-new-privileges',
  '--security-opt', `seccomp=${profile}`, '--user', 'pwuser', '--memory', '2g',
  '--cpus', '2', '--pids-limit', '128', '--shm-size', '256m',
  '--tmpfs', '/tmp:rw,nosuid,nodev,size=536870912',
  '--mount', `type=bind,source=${path.join(root, 'node_modules')},target=/app/node_modules,readonly`,
  '--mount', `type=bind,source=${path.join(root, 'src', 'verify-generic-browser.mjs')},target=/app/browser.mjs,readonly`,
  '--mount', `type=bind,source=${path.join(root, 'src', 'contract-browser-checks.mjs')},target=/app/contract-browser-checks.mjs,readonly`,
  '--mount', `type=bind,source=${outputDir},target=/input,readonly`,
  '--mount', `type=bind,source=${verificationDir},target=/output`,
  '-e', 'SKILLWALK_LIVE=1', '-w', '/app', image, 'node', 'browser.mjs'
];
if (process.env.PROOF_RUN) args.splice(1, 0, '--name', 'skillwalk-browser-' + process.env.PROOF_RUN);
const child = spawn(process.env.DOCKER_BIN || 'docker.exe', args, {stdio: 'inherit', windowsHide: true});
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', resolve);
});
const report = JSON.parse(await fs.readFile(path.join(verificationDir, 'generic-report.json'), 'utf8'));
report.artifactHash = hash;
report.contractHash = contractHash;
if (sha256(await fs.readFile(path.join(outputDir, 'website.html'))) !== hash || sha256(await fs.readFile(path.join(outputDir,'plan.json'))) !== contractHash) {
  report.passed = false;
  report.failure = 'Artifact changed during browser verification';
}
await json(path.join(verificationDir, 'generic-report.json'), report);
if (code) { report.passed = false; report.failure ||= 'Browser exited without completing verification'; await json(path.join(verificationDir, 'generic-report.json'), report); }
await json(path.join(verificationDir, 'execution-report.json'), report);
if (code || !report.passed) process.exitCode = 1;
