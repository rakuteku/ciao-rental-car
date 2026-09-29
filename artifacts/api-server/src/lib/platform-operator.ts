import { db, rentalOperatorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function platformOperatorId(): Promise<number> {
  const [platform] = await db.select({ id: rentalOperatorsTable.id })
    .from(rentalOperatorsTable).where(eq(rentalOperatorsTable.slug, "platform"));
  if (!platform) throw new Error("Platform rental operator is missing; apply the marketplace migration first");
  return platform.id;
}