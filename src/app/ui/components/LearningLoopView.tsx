import type { KnowledgeGapSnapshot, LearningLoopSnapshot, MasteryProfileSnapshot } from "../../../domain/learning/LearningLoop.js";

export interface LearningLoopViewProps {
  knowledgeGaps: readonly KnowledgeGapSnapshot[];
  learningLoop: LearningLoopSnapshot;
  masteryProfile?: MasteryProfileSnapshot;
}

export function LearningLoopView(props: LearningLoopViewProps) {
  const { knowledgeGaps, learningLoop, masteryProfile } = props;
  const remainingPracticeCount = learningLoop.practiceActivityIds.length;

  return (
    <div className="card">
      <h3>Learning Loop</h3>
      <p>
        Topic: {learningLoop.topic} · Phase: {learningLoop.phase}
      </p>
      <p>
        Assessments: {learningLoop.assessmentIds.length} · Evaluations: {learningLoop.evaluationIds.length}
      </p>
      <p>
        Practice activities: {remainingPracticeCount} · Reviews: {learningLoop.activeReviewSessionIds.length}
      </p>
      <p>Knowledge Gaps</p>
      <ul>
        {knowledgeGaps.length === 0 ? (
          <li>No diagnosed gaps yet.</li>
        ) : (
          knowledgeGaps.map((gap) => (
            <li key={gap.id}>
              <strong>{gap.topic}</strong> · {gap.description}
            </li>
          ))
        )}
      </ul>
      <p>Mastery</p>
      <ul>
        {masteryProfile?.topics.length ? (
          masteryProfile.topics.map((topic) => (
            <li key={topic.topic}>
              <strong>{topic.topic}</strong> · {Math.round(topic.score * 100)}% · {topic.status}
            </li>
          ))
        ) : (
          <li>No mastery profile recorded yet.</li>
        )}
      </ul>
    </div>
  );
}
