import { seedDemo, DEMO_ACCOUNT } from "@/lib/server/seed";

const result = await seedDemo();
console.log(
  result.created
    ? `Seeded demo workspace. Sign in as ${DEMO_ACCOUNT.email} (password in src/lib/server/seed/index.ts).`
    : "Demo account already exists — nothing to do.",
);
process.exit(0);
