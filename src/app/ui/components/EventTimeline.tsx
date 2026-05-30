import type { DomainEvent } from "../../../domain/primitives/Event.js";

export interface EventTimelineProps {
  events: readonly DomainEvent[];
}

export function EventTimeline(props: EventTimelineProps) {
  const { events } = props;

  return (
    <div className="card">
      <h3>Event Timeline</h3>
      <ul className="timeline-list">
        {events.map((domainEvent) => (
          <li key={domainEvent.id}>
            <strong>{domainEvent.type}</strong>
            <span>{domainEvent.occurredAt}</span>
            <span>{JSON.stringify(domainEvent.payload)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

