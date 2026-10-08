import test from 'node:test';
import assert from 'node:assert/strict';
import { InterviewService, buildReport } from '../server/interview.js';

const plan = {
  title: 'Lead iOS interview',
  questions: Array.from({ length: 8 }, (_, index) => ({
    id: `q${index + 1}`,
    category: index < 4 ? 'iOS' : 'Leadership',
    question: `Question ${index + 1}`,
    followUpHint: 'Explain a trade-off.',
    expectedMinutes: 3,
    weight: index < 4 ? 13 : 12,
    rubric: ['Shows sound judgment'],
    idealAnswerPoints: ['Explains trade-offs'],
  })),
};

test('starts a validated 30-minute interview without exposing the rubric', async () => {
  const ai = { completeJson: async () => structuredClone(plan) };
  const service = new InterviewService({ ai, now: () => 1000 });
  const interview = await service.start({
    role: 'iOS Developer',
    technology: 'Swift and SwiftUI',
    level: 'Lead',
  });

  assert.equal(interview.totalQuestions, 8);
  assert.equal(new Date(interview.deadlineAt).getTime(), 1_801_000);
  assert.equal(interview.currentQuestion.question, 'Question 1');
  assert.equal(interview.currentQuestion.rubric, undefined);
});

test('assesses an answer and advances to the next question', async () => {
  const ai = {
    completeJson: async ({ prompt }) => prompt.startsWith('Create')
      ? structuredClone(plan)
      : {
        score: 82,
        summary: 'Good trade-off analysis.',
        strengths: ['Clear architecture'],
        gaps: ['No migration plan'],
        rubricResults: [{ criterion: 'Shows sound judgment', met: true, evidence: 'Discussed trade-offs' }],
      },
  };
  let now = 1000;
  const service = new InterviewService({ ai, now: () => now });
  const interview = await service.start({ role: 'iOS Developer', technology: 'Swift', level: 'Lead' });
  now += 60_000;
  const result = await service.answer(interview.id, { answer: 'I would compare the trade-offs.' });

  assert.equal(result.completed, false);
  assert.equal(result.assessment.score, 82);
  assert.equal(result.interview.currentQuestionNumber, 2);
});

test('builds a weighted recommendation and counts missing answers as zero', () => {
  const session = {
    id: 'test',
    title: plan.title,
    role: 'iOS Developer',
    technology: 'Swift',
    level: 'Lead',
    questions: plan.questions,
    startedAt: 1000,
    completedAt: 2000,
    answers: plan.questions.slice(0, 5).map((question) => ({
      questionId: question.id,
      answer: 'Answer',
      assessment: { score: 90, summary: 'Strong', strengths: [], gaps: [], rubricResults: [] },
    })),
  };

  const report = buildReport(session, 'ended_by_interviewer');
  assert.equal(report.answeredCount, 5);
  assert.equal(report.overallScore, 57.6);
  assert.equal(report.recommendation.decision, 'DO_NOT_MOVE_FORWARD');
});
