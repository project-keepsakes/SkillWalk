import test from 'node:test';
import assert from 'node:assert/strict';
import {validateContract} from '../src/source-contract.mjs';
import {inspectionTimes} from '../src/source-inspection.mjs';
const source = [{id: 's0', start: 0, text: 'A blue heading'}, {id: 'v9', start: 9, text: 'Rendered heading', sourceKind: 'frame-observation'}];
const valid = () => ({summary: 'Heading', artifact: 'html', requirements: [{description: 'HTML', capability: 'html', segment_id: 's0'}], steps: [{action: 'Create heading', segment_id: 's0'}], content: [{text: 'Hello', selector: 'h1', segment_id: 's0'}], styles: [{selector: 'h1', property: 'color', value: 'blue', segment_id: 's0'}], structure: [], interactions: [], referenceFrames: ['v9']});
test('shared contract checks capabilities and citations before admitting execution', () => {
  const plan = valid(); assert.deepEqual(validateContract(plan, source), []); assert.equal(plan.supported, true);
  plan.requirements[0].capability = 'unavailable'; validateContract(plan, source); assert.equal(plan.supported, false);
  plan.requirements[0].capability = 'local-chat'; assert.match(validateContract(plan, source).join(' '), /full multimodal/);
  plan.styles[0].segment_id = 'invented'; assert.match(validateContract(plan, source).join(' '), /Unknown source/);
});
test('a valid citation cannot remove mandatory content and styling checks', () => {
  for (const field of ['content', 'styles']) { const plan = valid(); plan[field] = []; assert.ok(validateContract(plan, source).length); assert.equal(plan.supported, false); }
});
test('interactive capabilities cannot pass with an empty interaction contract', () => {
  const plan = valid(); plan.requirements.push({description:'Button behavior',capability:'browser-javascript',segment_id:'s0'});
  assert.match(validateContract(plan, source).join(' '), /executable interaction/);
  assert.equal(plan.supported, false);
});
test('all sources receive early, middle and late frame coverage', () => {
  assert.deepEqual(inspectionTimes(100), [6, 18, 32, 46, 60, 74, 86, 94, 98]);
  assert.throws(() => inspectionTimes(4000));
});
test('a contract rejects incompatible final styles but permits a later return to initial content',()=>{
  const plan=valid();plan.styles.push({...plan.styles[0],value:'red'});
  assert.match(validateContract(plan,source).join(';'),/Conflicting final style/);assert.equal(plan.supported,false);
  const interactive=valid();interactive.requirements.push({description:'Click',capability:'browser-javascript',segment_id:'s0'});
  interactive.interactions=[{type:'click',target:'Run',expected:'Hello',resultSelector:'h1',segment_id:'s0'}];
  assert.deepEqual(validateContract(interactive,source),[]); // Transition timing is checked against the actual DOM, not initial text alone.
});
