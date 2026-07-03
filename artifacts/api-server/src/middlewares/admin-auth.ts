import type { RequestHandler } from "express";

export const requireAdminAuth: RequestHandler = (req, res, next) => {
  const session = req.session as unknown as Record<string, unknown>;
  if (!session.admin) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
};
