import type { LearningLoopId } from "../../domain/primitives/ids.js";

export interface RuntimeConversationBindingSnapshot {
  createdAt: string;
  learningLoopId: LearningLoopId;
  profileId: string;
  provider: "relay";
  relayConversationId: string;
  updatedAt: string;
  workspaceId: string;
}

export class RuntimeConversationBinding {
  private constructor(private readonly snapshot: RuntimeConversationBindingSnapshot) {}

  static create(input: {
    learningLoopId: LearningLoopId;
    now?: () => Date;
    profileId: string;
    relayConversationId: string;
    workspaceId: string;
  }): RuntimeConversationBinding {
    const timestamp = (input.now ?? (() => new Date()))().toISOString();

    return new RuntimeConversationBinding({
      createdAt: timestamp,
      learningLoopId: input.learningLoopId,
      profileId: normalizeRequiredValue(input.profileId, "profileId"),
      provider: "relay",
      relayConversationId: normalizeRequiredValue(
        input.relayConversationId,
        "relayConversationId"
      ),
      updatedAt: timestamp,
      workspaceId: normalizeRequiredValue(input.workspaceId, "workspaceId")
    });
  }

  static rehydrate(
    snapshot: RuntimeConversationBindingSnapshot
  ): RuntimeConversationBinding {
    return new RuntimeConversationBinding({
      ...snapshot,
      profileId: normalizeRequiredValue(snapshot.profileId, "profileId"),
      relayConversationId: normalizeRequiredValue(
        snapshot.relayConversationId,
        "relayConversationId"
      ),
      workspaceId: normalizeRequiredValue(snapshot.workspaceId, "workspaceId")
    });
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  get profileId(): string {
    return this.snapshot.profileId;
  }

  get relayConversationId(): string {
    return this.snapshot.relayConversationId;
  }

  get workspaceId(): string {
    return this.snapshot.workspaceId;
  }

  touch(now: () => Date = () => new Date()): RuntimeConversationBinding {
    return new RuntimeConversationBinding({
      ...this.snapshot,
      updatedAt: now().toISOString()
    });
  }

  toSnapshot(): RuntimeConversationBindingSnapshot {
    return {
      ...this.snapshot
    };
  }
}

export function upsertRuntimeConversationBinding(
  bindings: readonly RuntimeConversationBinding[],
  binding: RuntimeConversationBinding | undefined
): readonly RuntimeConversationBinding[] {
  if (!binding) {
    return [...bindings];
  }

  return [
    ...bindings.filter(
      (candidate) => candidate.learningLoopId !== binding.learningLoopId
    ),
    binding
  ];
}

function normalizeRequiredValue(value: string | undefined, key: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Runtime conversation binding requires ${key}.`);
  }

  return trimmed;
}
