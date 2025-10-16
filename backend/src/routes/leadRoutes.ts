import { Router } from "express";
import { asyncHandler } from "./utils.js";
import { LeadService } from "../services/LeadService.js";

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
    asyncHandler(async (_req, res) => {
      const updates = await leadService.enrichPendingEmails();
      res.json({ updated: updates.length, leads: updates });
    })
  );

  router.get(
    "/export",
    asyncHandler(async (_req, res) => {
      const csv = await leadService.exportAsCsv();
      res.header("Content-Type", "text/csv");
      res.attachment("leads.csv");
      res.send(csv);
    })
  );

  return router;
};
