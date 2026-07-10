function calculateScore(answers, correctAnswers) {
  if (answers.length !== correctAnswers.length) {
    throw new Error('answers and correctAnswers length mismatch');
  }
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  for (let i = 0; i < correctAnswers.length; i++) {
    const a = answers[i];
    if (a && a === correctAnswers[i]) {
      score += 10;
      correctCount += 1;
    } else {
      score -= 5;
      wrongCount += 1;
    }
  }
  return { score, correctCount, wrongCount };
}

module.exports = { calculateScore };
