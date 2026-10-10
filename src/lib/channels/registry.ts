import "server-only";
import type { Executor } from "@/lib/server/db/client";
import type { ChannelProvider } from "./types";
import { MockChannelProvider } from "./mock";

/**
 * Resolves the provider for a conversation's channel. Only the simulator is
 * registered in this phase; an `instagram` adapter will be added here later.
 * Test conversations always use the simulator.
 */
export function getChannelProvider(channel: string, tx?: Executor): ChannelProvider {
  switch (channel) {
    case "mock":
    case "test":
      return new MockChannelProvider(tx);
    default:
      throw new Error(`No channel provider registered for "${channel}"`);
  }
}

export const registeredChannels = [{ id: "mock", name: "Simulator", realDelivery: false }] as const;
