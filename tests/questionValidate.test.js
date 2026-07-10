const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isValidQuestion, normalizeQuestions } = require('../src/services/questionValidate');

describe('isValidQuestion', () => {
  it('accepts well-formed MCQ', () => {
    assert.equal(
      isValidQuestion({
        text: 'Apa ibu kota Indonesia?',
        options: { A: 'Jakarta', B: 'Bandung', C: 'Surabaya', D: 'Medan' },
        correctAnswer: 'A',
      }),
      true
    );
  });

  it('rejects missing option or bad key', () => {
    assert.equal(
      isValidQuestion({
        text: 'x',
        options: { A: '1', B: '2', C: '3' },
        correctAnswer: 'A',
      }),
      false
    );
    assert.equal(
      isValidQuestion({
        text: 'x',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctAnswer: 'E',
      }),
      false
    );
  });
});

describe('normalizeQuestions', () => {
  it('keeps only valid items', () => {
    const out = normalizeQuestions([
      { text: 'Q1', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctAnswer: 'B' },
      { text: '', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctAnswer: 'A' },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].correctAnswer, 'B');
  });
});
