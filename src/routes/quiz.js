const express = require('express');
const Material = require('../models/Material');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const { requireAuth } = require('../middleware/auth');
const { calculateScore } = require('../services/scoring');
const config = require('../config');

const router = express.Router();

function sameId(a, b) {
  return String(a) === String(b);
}

async function questionsInAttemptOrder(questionIds) {
  const questions = await Question.find({ _id: { $in: questionIds } });
  const byId = new Map(questions.map((question) => [String(question._id), question]));
  const ordered = questionIds.map((id) => byId.get(String(id)));
  if (ordered.some((question) => !question)) {
    const err = new Error('Soal untuk attempt tidak lengkap');
    err.status = 400;
    throw err;
  }
  return ordered;
}

function handleQuizError(err, res, next) {
  if (err.status === 400) return res.sendStatus(400);
  next(err);
}

router.post('/:materialId/start', requireAuth, async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.materialId);
    if (!material || material.status !== 'ready') {
      req.flash('error', 'Materi tidak tersedia');
      return res.redirect('/materials');
    }

    const sampled = await Question.aggregate([
      { $match: { materialId: material._id } },
      { $sample: { size: config.questionsPerQuiz } },
    ]);

    if (sampled.length < config.questionsPerQuiz) {
      req.flash('error', 'Soal belum cukup untuk materi ini');
      return res.redirect('/materials');
    }

    const attempt = await Attempt.create({
      userId: req.session.user.id,
      materialId: material._id,
      questionIds: sampled.map((question) => question._id),
      answers: [],
      score: null,
      status: 'in_progress',
      startedAt: new Date(),
    });

    res.redirect(`/quiz/${attempt._id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/:attemptId', requireAuth, async (req, res, next) => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId);
    if (!attempt) return res.sendStatus(404);
    if (!sameId(attempt.userId, req.session.user.id)) return res.sendStatus(403);
    if (attempt.status === 'submitted') return res.redirect(`/quiz/${attempt._id}/result`);

    const questions = (await questionsInAttemptOrder(attempt.questionIds)).map((question) => ({
      _id: question._id,
      text: question.text,
      options: question.options,
    }));
    const startedAt = new Date(attempt.startedAt);
    const endsAt = new Date(startedAt.getTime() + config.quizDurationMs).toISOString();

    res.render('quiz/take', { attempt, questions, endsAt });
  } catch (err) {
    handleQuizError(err, res, next);
  }
});

router.post('/:attemptId/submit', requireAuth, async (req, res, next) => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId);
    if (!attempt) return res.sendStatus(404);
    if (!sameId(attempt.userId, req.session.user.id)) return res.sendStatus(403);
    if (attempt.status === 'submitted') return res.redirect(`/quiz/${attempt._id}/result`);

    const questions = await questionsInAttemptOrder(attempt.questionIds);
    const postedAnswers = req.body.answers || [];
    const answers = attempt.questionIds.map((_, i) => {
      const value = postedAnswers[i];
      return ['A', 'B', 'C', 'D'].includes(value) ? value : null;
    });
    const result = calculateScore(
      answers,
      questions.map((question) => question.correctAnswer)
    );
    const now = new Date();
    const elapsedMs = now.getTime() - new Date(attempt.startedAt).getTime();

    attempt.answers = answers;
    attempt.score = result.score;
    attempt.correctCount = result.correctCount;
    attempt.wrongCount = result.wrongCount;
    attempt.status = 'submitted';
    attempt.timedOut = elapsedMs > config.quizDurationMs;
    attempt.submittedAt = now;
    attempt.durationSec = Math.round(elapsedMs / 1000);
    await attempt.save();

    res.redirect(`/quiz/${attempt._id}/result`);
  } catch (err) {
    handleQuizError(err, res, next);
  }
});

router.get('/:attemptId/result', requireAuth, async (req, res, next) => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId);
    if (!attempt) return res.sendStatus(404);
    if (!sameId(attempt.userId, req.session.user.id)) return res.sendStatus(403);
    if (attempt.status !== 'submitted') return res.redirect(`/quiz/${attempt._id}`);

    const material = await Material.findById(attempt.materialId);
    res.render('quiz/result', { attempt, material });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
