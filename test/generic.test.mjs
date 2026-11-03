import test from 'node:test';
import assert from 'node:assert/strict';
import {genericPlanSchema, validateGenericPlan} from '../src/generic-proof.mjs';

const segments = [{id: 's0', start: 3, text: 'Create a page titled Example and show a button.'}];

test('generic plans must cite exact source and provide visible checks', () => {
  const plan = {
    supported: true, summary: 'Build a page', interactive: true,
    requirements: [{description: 'HTML page', available: true, segment_id: 's0', quote: 'Create a page'}],
    steps: [{action: 'Create a page', segment_id: 's0', quote: 'page titled Example'}],
    checks: [{type: 'click', target: 'Go', expected: 'Example', segment_id: 's0', quote: 'show a button'}]
  };
  assert.deepEqual(validateGenericPlan(plan, segments), []);
  assert.equal(plan.steps[0].timestamp, 3);
  assert.equal(plan.steps[0].quote, segments[0].text);
  assert.deepEqual(validateGenericPlan({...plan, checks: [{...plan.checks[0], expected: '1'}]}, segments), []);
  assert.notDeepEqual(validateGenericPlan({...plan, steps: [{...plan.steps[0], segment_id: 'missing'}]}, segments), []);
  assert.notDeepEqual(validateGenericPlan({...plan, checks: []}, segments), []);
  assert.notDeepEqual(validateGenericPlan({...plan, interactive: false}, segments), []);
  assert.notDeepEqual(validateGenericPlan({...plan, summary: 'Insufficient evidence to determine behavior'}, segments), []);
  assert.deepEqual(validateGenericPlan({...plan, checks: [{...plan.checks[0], type: 'click_console'}]}, segments), []);
  assert.notDeepEqual(validateGenericPlan({...plan, checks: [{...plan.checks[0], type: 'visible'}]}, segments), []);
  assert.notDeepEqual(validateGenericPlan({...plan, supported: false}, segments), []);
  assert.notDeepEqual(validateGenericPlan({...plan, requirements: [{...plan.requirements[0], available: false}]}, segments), []);
});

test('frame-observation citations retain their provenance', () => {
  const frame = {id: 'f1', start: 1, text: 'A button says Go', sourceKind: 'frame-observation'};
  const plan = {supported: true, interactive: false, summary: 'Page',
    requirements: [{description: 'Button', available: true, segment_id: 'f1', quote: 'button says Go'}],
    steps: [{action: 'Make button', segment_id: 'f1', quote: 'button says Go'}],
    checks: [{type: 'visible', target: '', expected: 'Go!', segment_id: 'f1', quote: 'button says Go'}]};
  assert.deepEqual(validateGenericPlan(plan, [frame]), []);
  assert.equal(plan.steps[0].sourceKind, 'frame-observation');
});

test('unsupported interactive plans retain their explicit incompatibility', () => {
  const plan = {supported: false, interactive: true, summary: 'Requires an unavailable backend',
    requirements: [{description: 'Backend', available: false, segment_id: 's0', quote: 'Create a page'}],
    steps: [], checks: []};
  assert.deepEqual(validateGenericPlan(plan, segments), []);
});

test('planner schema restricts every citation to source IDs and omits model-authored quotes', () => {
  const schema = genericPlanSchema(['s0', 'f1', 's0']);
  assert.equal(schema.additionalProperties, false);
  for (const field of ['requirements', 'steps', 'checks']) {
    const item = schema.properties[field].items;
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.properties.segment_id.enum, ['s0', 'f1']);
    assert.equal(Object.hasOwn(item.properties, 'quote'), false);
  }
  assert.throws(() => genericPlanSchema([]), /Source IDs/);
});

test('validation replaces any supplied quotation with canonical evidence', () => {
  const plan = {supported: true, interactive: false, summary: 'A page',
    requirements: [{description: 'Page', available: true, segment_id: 's0', quote: 'invented'}],
    steps: [{action: 'Build', segment_id: 's0', quote: 'invented'}],
    checks: [{type: 'visible', target: '', expected: 'Example', segment_id: 's0', quote: 'invented'}]};
  assert.deepEqual(validateGenericPlan(plan, segments), []);
  for (const entry of [plan.requirements[0], plan.steps[0], plan.checks[0]]) {
    assert.equal(entry.quote, segments[0].text);
    assert.equal(entry.sourceKind, 'caption');
  }
  assert.notDeepEqual(validateGenericPlan({...plan, checks: [{...plan.checks[0], segment_id: 'N/A'}]}, segments), []);
});
