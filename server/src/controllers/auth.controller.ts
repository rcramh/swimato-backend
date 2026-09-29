import type { Request, Response } from "express";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearAccessCookieOptions,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from "../config/cookies.js";
import { getAuth, readCookie } from "../middlewares/authenticate.js";
import * as authService from "../services/auth.service.js";
import type { AuthResult, RequestMeta } from "../services/auth.service.js";
import { sendNoContent, sendSuccess } from "../utils/response.js";
import { parseInput } from "../utils/validation.js";
import {
  changePasswordSchema,
  loginSchema,
  signupSchema,
} from "../validators/auth.validators.js";

/* ---------------------------------------------------------------
   Auth controller

   The HTTP edge of the auth service: parse input, call the service,
   turn tokens into httpOnly cookies. Tokens never appear in a
   response body, so no script on the page can ever read them.
----------------------------------------------------------------*/

const MAX_USER_AGENT_LENGTH = 512;

const requestMeta = (req: Request): RequestMeta => ({
  userAgent: (req.get("user-agent") ?? "").slice(0, MAX_USER_AGENT_LENGTH),
  ip: req.ip ?? "",
});

function setAuthCookies(
  res: Response,
  { accessToken, refreshToken }: AuthResult,
) {
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  }
}

function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, clearAccessCookieOptions());
  res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
}

export async function signup(req: Request, res: Response) {
  const input = parseInput(signupSchema, req.body);
  const result = await authService.signup(input, requestMeta(req));
  setAuthCookies(res, result);
  sendSuccess(res, { user: result.user }, 201);
}

export async function login(req: Request, res: Response) {
  const input = parseInput(loginSchema, req.body);
  const result = await authService.login(input, requestMeta(req));
  setAuthCookies(res, result);
  sendSuccess(res, { user: result.user });
}

export async function refresh(req: Request, res: Response) {
  try {
    const result = await authService.refresh(readCookie(req, REFRESH_COOKIE));
    setAuthCookies(res, result);
    sendSuccess(res, { user: result.user });
  } catch (error) {
    // A dead refresh cookie is useless: clear it so the browser stops
    // sending it and the client settles into "signed out". The error
    // itself still goes to the central handler.
    clearAuthCookies(res);
    throw error;
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(readCookie(req, REFRESH_COOKIE));
  clearAuthCookies(res);
  sendNoContent(res);
}

export async function logoutEverywhere(req: Request, res: Response) {
  await authService.logoutEverywhere(getAuth(req).userId);
  clearAuthCookies(res);
  sendNoContent(res);
}

export async function changePassword(req: Request, res: Response) {
  const input = parseInput(changePasswordSchema, req.body);
  await authService.changePassword(getAuth(req), input);
  sendNoContent(res);
}

export async function me(req: Request, res: Response) {
  const user = await authService.getCurrentUser(getAuth(req).userId);
  sendSuccess(res, { user });
}
