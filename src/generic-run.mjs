import {experimentalModelEnvironment} from './experimental-model.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DocumentRun} from './document-run.mjs';
import {acquireTutorial} from './acquire.mjs';
import {json, readJSON, sha256} from './util.mjs';
import {deliverCheckedResult} from './result-delivery.mjs';

export class GenericRun extends DocumentRun {
  constructor(id, notify, tutorialId) {
    super(id, notify);
    this.kind = 'generic';
    this.pipeline = 'shared-v1';
    this.stepTimeoutMs = 45 * 60 * 1000;
    this.modelEnvironment = experimentalModelEnvironment();
    this.models = {text:this.modelEnvironment.GEMMA_TEXT_MODEL, vision:this.modelEnvironment.GEMMA_MODEL};
    this.tutorialId = tutorialId;
    this.artifactName = 'website.html';
  }

  view() {
    const view = super.view();
    view.pipeline = this.pipeline;
    view.execution = {...view.execution, skill: this.plan?.artifact === 'document-app' ? 'Multimodal document workflow' : 'Source-derived HTML', sourceId: this.tutorialId, sourceURL: 'https://www.youtube.com/watch?v=' + this.tutorialId, skillURL: null, tasks: (this.plan?.steps || []).map(s => s.action)};
    return view;
  }

  async analyze() {
    await this.init();
    this.state('analyzing', 'Acquiring actual tutorial and captions');
    await acquireTutorial('https://www.youtube.com/watch?v=' + this.tutorialId);
    this.throwIfStopping();
    const result = await this.step('generic-proof.mjs', ['analyze']);
    if (result.code !== 0) throw Error(result.error || 'Source analysis failed');
    this.plan = await readJSON(path.join(this.dir, 'output/plan.json'));
    this.configureArtifact();
    const demo = await readJSON(path.join(this.dir, 'output/demo-brief.json'));
    this.demoBrief = demo.brief;
    await json(path.join(this.dir, 'brief.json'), demo.brief);
    this.demoSource = demo.provenance;
    this.throwIfStopping();
    this.state('review', 'Review the source-derived task before running.');
  }

  configureArtifact() {
    this.kind = this.plan?.artifact === 'document-app' ? 'document' : 'generic';
    this.artifactName = this.kind === 'document' ? 'document-app.zip' : 'website.html';
  }

  async step(script, args = []) {
    return super.step(script === 'document-proof.mjs' ? 'shared-document-proof.mjs' : script, args);
  }

  async execute() {
    this.activateModelProfile();
    if (this.kind === 'document') return super.execute();
    this.stopping = false;
    this.failure = null;
    this.checks = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      this.throwIfStopping();
      this.state(attempt ? 'repairing' : 'generating',
        attempt ? 'Gemma is repairing the HTML' : 'Gemma is creating the source-derived HTML');
      let result = await this.step('generic-proof.mjs', ['generate']);
      if (result.code !== 0) {
        this.repairFeedback = result.error || 'Generated artifact rejected';
        continue;
      }
      this.throwIfStopping();
      this.state('testing', 'Testing the actual artifact in isolated Chromium');
      result = await this.step('verify-generic.mjs');
      this.throwIfStopping();
      let report = await readJSON(path.join(this.dir, 'verification/generic-report.json'));
      if (result.code === 0 && report.passed) {
        await json(path.join(this.dir, 'verification/execution-report.json'), report);
        this.state('testing', 'Comparing actual tutorial content and styling with the rendered result');
        result = await this.step('visual-contract-review.mjs');
        this.throwIfStopping();
        const fidelity = await readJSON(path.join(this.dir, 'verification/source-fidelity.json')).catch(() => null);
        if (result.code !== 0 || fidelity?.passed !== true || fidelity.artifactHash !== report.artifactHash || fidelity.contractHash !== report.contractHash) {
          await json(path.join(this.dir, 'verification/verification-report.json'), {passed:false, executionPassed:true, artifactHash:report.artifactHash, fidelity, failure:result.error || 'Source fidelity is unresolved; successful execution was preserved.'});
          throw Error('Execution passed; source verification failed or is uncertain. Artifact preserved without regeneration.');
        }
        await json(path.join(this.dir, 'verification/verification-report.json'), {passed:true, executionPassed:true, artifactHash:report.artifactHash, fidelity});
        report.checks.push('Separate source-fidelity review passed');
      }
      if (result.code === 0 && report.passed) {
        const hash = sha256(await fs.readFile(path.join(this.dir, 'output/website.html')));
        const generation = await readJSON(path.join(this.dir, 'output/generic-generation.json'));
        if (hash !== generation.sha256 || hash !== report.artifactHash || report.contractHash !== generation.contractHash || generation.contractHash !== sha256(await fs.readFile(path.join(this.dir, 'output/plan.json')))) {
          throw Error('Artifact changed between generation and checks');
        }
        await deliverCheckedResult(this, {
          passed: true, kind: this.kind, sourceVideoId: this.tutorialId,
          presentationHash: hash, artifactHash: hash, checks: report.checks,
          verifiedAt: new Date().toISOString()
        }, 'Local HTML passed the recorded browser checks.');
        return;
      }
      this.repairFeedback = report.failure || result.error;
      this.failure = this.repairFeedback;
      this.event('validation-failed', {failure: this.repairFeedback, attempt: attempt + 1});
    }
    throw Error('Bounded generation or verification failed: ' + this.repairFeedback);
  }

  async verifySourceOutcome() {
    this.throwIfStopping();
    const result = await this.step('verify-document-source.mjs');
    this.throwIfStopping();
    if (result.code !== 0) throw Error(result.error || 'Document source requirements or styling did not match');
  }

  activateModelProfile() {
    this.models = {text:this.modelEnvironment.GEMMA_TEXT_MODEL, vision:this.modelEnvironment.GEMMA_MODEL};
    this.event('state', {status:this.status, stage:this.stage, kind:this.kind,
      execution:this.view().execution, message:'New work uses the current local model profile; recorded evidence is unchanged.'});
  }

  async retry() {
    this.activateModelProfile();
    return this.kind === 'document' ? super.retry() : this.execute();
  }

  async openApp() {
    this.activateModelProfile();
    return super.openApp();
  }
}
