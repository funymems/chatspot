import { z } from "zod";

export const workspaceNameSchema = z.string().trim().min(2, "Use at least 2 characters").max(60);

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema });
export const renameWorkspaceSchema = z.object({ name: workspaceNameSchema });
