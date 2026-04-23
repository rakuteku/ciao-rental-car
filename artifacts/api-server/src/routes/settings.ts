import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import {
  GetSettingsResponse,
  UpdateAdminSettingsBody,
  UpdateAdminSettingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db
    .insert(settingsTable)
    .values({ airportPickupFee: 9800, airportDropoffFee: 9800 })
    .returning();
  return created;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetSettingsResponse.parse(settings));
});

router.get("/admin/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetSettingsResponse.parse(settings));
});

router.put("/admin/settings", async (req, res): Promise<void> => {
  const body = UpdateAdminSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const current = await getOrCreateSettings();

  const updates: Partial<typeof current> = {};
  if (body.data.airportPickupFee !== undefined) {
    updates.airportPickupFee = body.data.airportPickupFee;
  }
  if (body.data.airportDropoffFee !== undefined) {
    updates.airportDropoffFee = body.data.airportDropoffFee;
  }

  const [updated] = await db
    .update(settingsTable)
    .set(updates)
    .returning();

  res.json(UpdateAdminSettingsResponse.parse(updated));
});

export default router;
