import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDocumentAnswer} from '../src/document-answers.mjs';
test('an unrelated refusal cannot hide a fabricated concert ticket answer', () => {
  const check = answer => checkDocumentAnswer(2, {answer, evidence: [{text: 'A population chart'}]});
  for (const answer of ['$50. I do not know the venue.', 'It costs fifty dollars. I do not know the venue.', 'Tickets are free. The document does not mention the venue.', 'I do not know the venue.', 'The price is 50 dollars, but I cannot confirm it.']) assert.equal(check(answer), false, answer);
  for (const answer of ['I do not know.', 'The document does not contain ticket prices.', 'I cannot determine the cost of a concert ticket from the provided context.']) assert.equal(check(answer), true, answer);
});
