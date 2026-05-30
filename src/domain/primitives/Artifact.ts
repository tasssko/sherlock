import type { AgentId, ArtifactId, TaskId, WorkspaceId } from "./ids.js";
import { createArtifactId } from "./ids.js";
import type { DomainEventRecorder } from "./Event.js";

export type ArtifactType = "assessment" | "explanation" | "study-plan";

export interface ArtifactProvenanceSnapshot {
  controller: string;
  taskId?: TaskId;
  agentId?: AgentId;
  sourceArtifactIds: readonly ArtifactId[];
  sourceTopics: readonly string[];
  facts: readonly string[];
  assumptions: readonly string[];
  decisions: readonly string[];
}

export interface CreateArtifactProvenanceInput {
  controller: string;
  taskId?: TaskId;
  agentId?: AgentId;
  sourceArtifactIds?: readonly ArtifactId[];
  sourceTopics?: readonly string[];
  facts: readonly string[];
  assumptions: readonly string[];
  decisions: readonly string[];
}

export class ArtifactProvenance {
  private constructor(private readonly snapshot: ArtifactProvenanceSnapshot) {}

  static create(input: CreateArtifactProvenanceInput): ArtifactProvenance {
    return new ArtifactProvenance({
      controller: input.controller,
      taskId: input.taskId,
      agentId: input.agentId,
      sourceArtifactIds: [...(input.sourceArtifactIds ?? [])],
      sourceTopics: [...(input.sourceTopics ?? [])],
      facts: [...input.facts],
      assumptions: [...input.assumptions],
      decisions: [...input.decisions]
    });
  }

  revise(decisions: readonly string[]): ArtifactProvenance {
    return new ArtifactProvenance({
      ...this.snapshot,
      decisions: [...decisions]
    });
  }

  toSnapshot(): ArtifactProvenanceSnapshot {
    return {
      ...this.snapshot,
      sourceArtifactIds: [...this.snapshot.sourceArtifactIds],
      sourceTopics: [...this.snapshot.sourceTopics],
      facts: [...this.snapshot.facts],
      assumptions: [...this.snapshot.assumptions],
      decisions: [...this.snapshot.decisions]
    };
  }
}

export interface ArtifactSnapshot<TContent = unknown, TType extends ArtifactType = ArtifactType> {
  id: ArtifactId;
  workspaceId: WorkspaceId;
  taskId?: TaskId;
  type: TType;
  content: TContent;
  provenance: ArtifactProvenanceSnapshot;
  version: number;
  createdAt: string;
}

export interface CreateArtifactInput<TContent, TType extends ArtifactType> {
  workspaceId: WorkspaceId;
  taskId?: TaskId;
  type: TType;
  content: TContent;
  provenance: ArtifactProvenance;
}

export class Artifact<TContent = unknown, TType extends ArtifactType = ArtifactType> {
  private constructor(private readonly snapshot: ArtifactSnapshot<TContent, TType>) {}

  static rehydrate<TContent, TType extends ArtifactType>(
    snapshot: ArtifactSnapshot<TContent, TType>
  ): Artifact<TContent, TType> {
    return new Artifact({
      ...snapshot,
      provenance: {
        ...snapshot.provenance,
        sourceArtifactIds: [...snapshot.provenance.sourceArtifactIds],
        sourceTopics: [...snapshot.provenance.sourceTopics],
        facts: [...snapshot.provenance.facts],
        assumptions: [...snapshot.provenance.assumptions],
        decisions: [...snapshot.provenance.decisions]
      }
    });
  }

  static create<TContent, TType extends ArtifactType>(
    input: CreateArtifactInput<TContent, TType>,
    events: DomainEventRecorder
  ): Artifact<TContent, TType> {
    events.assertWorkspace(input.workspaceId);

    const artifact = new Artifact<TContent, TType>({
      id: createArtifactId(),
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      type: input.type,
      content: input.content,
      provenance: input.provenance.toSnapshot(),
      version: 1,
      createdAt: new Date().toISOString()
    });

    events.recordArtifactGenerated(artifact.id, artifact.type, artifact.taskId, artifact.version);

    return artifact;
  }

  get id(): ArtifactId {
    return this.snapshot.id;
  }

  get workspaceId(): WorkspaceId {
    return this.snapshot.workspaceId;
  }

  get taskId(): TaskId | undefined {
    return this.snapshot.taskId;
  }

  get type(): TType {
    return this.snapshot.type;
  }

  get content(): TContent {
    return this.snapshot.content;
  }

  get provenance(): ArtifactProvenanceSnapshot {
    return this.snapshot.provenance;
  }

  get version(): number {
    return this.snapshot.version;
  }

  revise(
    content: TContent,
    decisions: readonly string[],
    events: DomainEventRecorder
  ): Artifact<TContent, TType> {
    events.assertWorkspace(this.snapshot.workspaceId);

    const revised = new Artifact<TContent, TType>({
      ...this.snapshot,
      content,
      provenance: ArtifactProvenance.create(this.snapshot.provenance).revise(decisions).toSnapshot(),
      version: this.snapshot.version + 1
    });

    events.recordArtifactRevised(revised.id, revised.version);

    return revised;
  }

  toSnapshot(): ArtifactSnapshot<TContent, TType> {
    return {
      ...this.snapshot,
      provenance: {
        ...this.snapshot.provenance,
        facts: [...this.snapshot.provenance.facts],
        assumptions: [...this.snapshot.provenance.assumptions],
        decisions: [...this.snapshot.provenance.decisions]
      }
    };
  }
}
