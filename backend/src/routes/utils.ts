import type { NextFunction, Request, Response } from "express";

export const asyncHandler =
  <T extends Request, U extends Response>(handler: (req: T, res: U, next: NextFunction) => Promise<unknown>) =>
  (req: T, res: U, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };

