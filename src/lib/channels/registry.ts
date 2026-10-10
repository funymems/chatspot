import "server-only";
import type { Executor } from "@/lib/server/db/client";
import type { ChannelProvider } from "./types";
import { MockChannelProvider } from "./mock";
import { InstagramChannelProvider } from "./instagram";

/**
 * Resolves the provider for a conversation's channel. Instagram is
 * receive-only for now (webhooks → inbox); sending is not enabled yet.
 * Test conversations always use the simulator.
 */
export function getChannelProvider(channel: string, tx?: Executor): ChannelProvider {
  switch (channel) {
    case "mock":
    case "test":
      return new MockChannelProvider(tx);
    case "instagram":
      return new InstagramChannelProvider();
    default:
      throw new Error(`No channel provider registered for "${channel}"`);
  }
}

export const registeredChannels = [
  { id: "mock", name: "Simulator", realDelivery: false },
  { id: "instagram", name: "Instagram (receive-only)", realDelivery: false },
] as const;
