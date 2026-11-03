import test from 'node:test';
import assert from 'node:assert/strict';
import {failureMessage} from '../web/run-messages.mjs';

test('failure guidance preserves diagnosis and never presents a preview as verified', () => {
  const message = failureMessage('Missing visible source requirement: Example');
  assert.match(message, /Missing visible source requirement: Example/);
  assert.match(message, /No verified final result/);
  assert.match(message, /has not verified that the output matches/);
  assert.match(failureMessage('No English captions available'), /caption availability for the selected supported tutorial/);
  assert.match(failureMessage('fetch failed'), /local Gemma service/);
  assert.match(failureMessage('Stopped', {stopped: true}), /SkillWalk stopped/);
});
