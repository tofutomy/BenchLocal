import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { BenchLocalAgentEvent } from "@core";

export type BenchLocalControllerEventName = "agent-event";

export class AgentEventBus {
  private readonly events = new EventEmitter();

  // 对外只暴露领域事件，避免调用方依赖 Node EventEmitter 的实现细节。
  onAgentEvent(listener: (event: BenchLocalAgentEvent) => void): () => void {
    this.events.on("agent-event", listener);
    return () => this.events.off("agent-event", listener);
  }

  emitAgentEvent<TPayload>(
    type: BenchLocalAgentEvent["type"],
    payload: TPayload
  ): BenchLocalAgentEvent<TPayload> {
    const event: BenchLocalAgentEvent<TPayload> = {
      eventId: `evt-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      type,
      payload
    };

    this.events.emit("agent-event", event);
    return event;
  }
}
