const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateScore } = require('../src/services/scoring');

describe('calculateScore', () => {
  it('scores all correct as 100', () => {
    const correct = Array(10).fill('A');
    const r = calculateScore(correct, correct);
    assert.equal(r.score, 100);
    assert.equal(r.correctCount, 10);
    assert.equal(r.wrongCount, 0);
  });

  it('scores all wrong as -50', () => {
    const correct = Array(10).fill('A');
    const answers = Array(10).fill('B');
    const r = calculateScore(answers, correct);
    assert.equal(r.score, -50);
    assert.equal(r.correctCount, 0);
    assert.equal(r.wrongCount, 10);
  });

  it('treats blank as wrong', () => {
    const r = calculateScore([null, 'A'], ['A', 'A']);
    assert.equal(r.score, 5); // -5 + 10
    assert.equal(r.correctCount, 1);
    assert.equal(r.wrongCount, 1);
  });
});
