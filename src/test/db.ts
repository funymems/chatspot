import { createDatabase, setDbForTesting } from "@/lib/server/db/client";

/** Fresh, fully migrated in-memory database for the current test file. */
export async function useTestDatabase() {
  const state = createDatabase("memory://");
  setDbForTesting(state);
  await state.ready;
  return state.db;
}
