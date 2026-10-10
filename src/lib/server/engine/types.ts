/** Persisted interpreter state for one execution (automation_executions.state). */
export type ExecState = {
  vars: Record<string, string>;
  /** Latest inbound message text (for conditions / capture / {{message.text}}). */
  message: string;
  /** Next node to execute; null when finished. */
  cursor: string | null;
  /** Set while the execution is paused. */
  wait?: WaitState;
  /** Message nodes whose pre-send delay has already elapsed for the current visit. */
  delayDone: string[];
  redirectDepth: number;
  /** Next node-log sequence number. */
  seq: number;
  /** Retry attempts used for the current node. */
  retries: number;
};

export type WaitState = {
  kind: "delay" | "reply" | "retry";
  nodeId: string;
  /** Random token; resume requests must present it (stale jobs are ignored). */
  token: string;
  /** For delay waits: whether we're waiting before sending (message) or after (wait action). */
  phase?: "before_send" | "after";
  saveAs?: string;
  resumeAt?: string;
};

export type ResumeInput =
  | { token: string; reason: "delay" | "retry" }
  | { token: string; reason: "reply"; text: string }
  | { token: string; reason: "reply_timeout" };

export type ExecutionInput = {
  text?: string;
  eventName?: string;
  source: "test" | "inbound" | "redirect" | "retry";
};

export function initialState(cursor: string, input: ExecutionInput, redirectDepth = 0, vars: Record<string, string> = {}): ExecState {
  return { vars, message: input.text ?? "", cursor, delayDone: [], redirectDepth, seq: 0, retries: 0 };
}

/** Errors worth retrying (provider timeouts, 5xx). Anything else fails the run. */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

export class NodeTimeoutError extends RetryableError {
  constructor(nodeType: string, ms: number) {
    super(`${nodeType} step timed out after ${ms / 1000}s`);
    this.name = "NodeTimeoutError";
  }
}
