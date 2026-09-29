import type { Request, Response } from "express";
import { listUsers } from "../services/user.service.js";
import { sendSuccess } from "../utils/response.js";
import { parseInput } from "../utils/validation.js";
import { cursorPageQuerySchema } from "../validators/pagination.validators.js";

export async function getUsers(req: Request, res: Response) {
  const query = parseInput(cursorPageQuerySchema, req.query);
  sendSuccess(res, await listUsers(query));
}
