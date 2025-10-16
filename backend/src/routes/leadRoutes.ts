import { Router } from "express";
import { asyncHandler } from "./utils.js";
import { LeadService } from "../services/LeadService.js";

const parseIds = (value: unknown): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  return undefined;
};

export const createLeadRouter = (leadService: LeadService): Router => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const leads = await leadService.list();
      res.json(leads);
    })
  );

  router.post(
    "/enrich",
    asyncHandler(async (req, res) => {
      const ids = parseIds(req.body?.ids);
      const updates = await leadService.enrichPendingEmails(ids);
      res.json({ updated: updates.length, leads: updates });
    })
  );

  router.delete(
    "/",
    asyncHandler(async (req, res) => {
      const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
      await leadService.delete(ids);
      res.status(204).send();
    })
  );

  router.get(
    "/export",
    asyncHandler(async (req, res) => {
      const ids = parseIds(req.query?.ids);
      const csv = await leadService.exportAsCsv(ids);
      res.header("Content-Type", "text/csv");
      res.attachment("leads.csv");
      res.send(csv);
    })
  );

  return router;
};
