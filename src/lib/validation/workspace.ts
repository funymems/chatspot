import { z } from "zod";
import "./locale";

export const workspaceNameSchema = z.string().trim().min(2, "Не менее 2 символов").max(60);

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema });
export const renameWorkspaceSchema = z.object({ name: workspaceNameSchema });
