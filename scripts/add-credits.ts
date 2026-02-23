import { db } from "../src/db";
import { workspace } from "../src/db/schema";
import { CreditModel } from "../src/models/credit.model";
import { like } from "drizzle-orm";

const slug = process.argv[2] || "my-space2";
const amount = parseInt(process.argv[3] || "100");

const ws = await db.select().from(workspace).where(like(workspace.slug, `%${slug}%`));
if (!ws.length) { console.error("Workspace not found:", slug); process.exit(1); }

console.log("Found workspaces:", ws.map(w => `${w.id} | ${w.slug} | ${w.name}`).join("\n"));
const target = ws[0];

const result = await CreditModel.addCredits({
  workspaceId: target.id,
  amount,
  type: "bonus",
  description: `Admin bonus: ${amount} credits`,
});

console.log(`Done! Workspace: ${target.slug} | New balance: ${result.balance}`);
process.exit(0);
