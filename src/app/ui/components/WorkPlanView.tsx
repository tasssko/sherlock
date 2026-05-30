import type { WorkPlanSnapshot } from "../../../domain/primitives/WorkPlan.js";

export interface WorkPlanViewProps {
  workPlan: WorkPlanSnapshot;
}

export function WorkPlanView(props: WorkPlanViewProps) {
  const { workPlan } = props;

  return (
    <div className="card">
      <h3>Work Plan</h3>
      <p>{workPlan.objective}</p>
      <ul>
        {workPlan.stages.map((stage) => (
          <li key={stage.id}>
            <strong>{stage.title}</strong> · {stage.objective}
          </li>
        ))}
      </ul>
      <p>Assumptions</p>
      <ul>
        {workPlan.assumptions.map((assumption) => (
          <li key={assumption.id}>{assumption.statement}</li>
        ))}
      </ul>
    </div>
  );
}

