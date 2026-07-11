const KEYS = ['A', 'B', 'C', 'D'];

function isValidQuestion(q) {
  if (!q || typeof q.text !== 'string' || !q.text.trim()) return false;
  if (!q.options || typeof q.options !== 'object') return false;
  for (const k of KEYS) {
    if (typeof q.options[k] !== 'string' || !q.options[k].trim()) return false;
  }
  if (!KEYS.includes(q.correctAnswer)) return false;
  return true;
}

function normalizeQuestions(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  return rawArray
    .map((q) => ({
      text: String(q?.text || '').trim(),
      options: {
        A: String(q?.options?.A || '').trim(),
        B: String(q?.options?.B || '').trim(),
        C: String(q?.options?.C || '').trim(),
        D: String(q?.options?.D || '').trim(),
      },
      correctAnswer: String(q?.correctAnswer || '').trim().toUpperCase(),
    }))
    .filter(isValidQuestion);
}

module.exports = { isValidQuestion, normalizeQuestions };
