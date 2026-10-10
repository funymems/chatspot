import fs from "node:fs";
import { resolveDataDir, getDb } from "@/lib/server/db/client";
import { seedDemo } from "@/lib/server/seed";

const dir = resolveDataDir();
if (!dir.startsWith("memory://")) {
  const lock = `${dir}.lock`;
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    try {
      process.kill(pid, 0);
      console.error(`Database is in use by process ${pid}. Stop the dev server first.`);
      process.exit(1);
    } catch {
      fs.unlinkSync(lock);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`Deleted ${dir}`);
}
await getDb(); // re-creates and migrates
await seedDemo();
console.log("Database reset and demo data seeded.");
process.exit(0);
