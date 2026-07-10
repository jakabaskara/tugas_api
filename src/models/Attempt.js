const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true,
  },
  questionIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
    },
  ],
  answers: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  score: {
    type: Number,
    default: null,
  },
  correctCount: {
    type: Number,
    default: 0,
  },
  wrongCount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['in_progress', 'submitted'],
    default: 'in_progress',
  },
  timedOut: {
    type: Boolean,
    default: false,
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  submittedAt: Date,
  durationSec: Number,
});

module.exports = mongoose.model('Attempt', attemptSchema);
