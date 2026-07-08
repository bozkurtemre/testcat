import type { AgentEvent, RunDoneMessage } from "@testcat/shared";
import { useEffect, useState } from "react";

/** Subscribes to a run's streamed events + completion for the given runId. */
export function useRunStream(runId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [done, setDone] = useState<RunDoneMessage | null>(null);

  useEffect(() => {
    if (!runId) return;
    setEvents([]);
    setDone(null);
    const offEvent = window.testcat.onRunEvent((msg) => {
      if (msg.runId === runId) setEvents((prev) => [...prev, msg.event]);
    });
    const offDone = window.testcat.onRunDone((msg) => {
      if (msg.runId === runId) setDone(msg);
    });
    return () => {
      offEvent();
      offDone();
    };
  }, [runId]);

  return { events, done };
}
