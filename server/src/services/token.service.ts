import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { ROLES, type Role } from "../constants/roles.js";
import { AuthenticationError } from "../errors/AppError.js";

/* ---------------------------------------------------------------
   Tokens

   Access token  — 15 min. Carries who you are (sub), what you may do
                   (role) and which session issued it (sid). No
                   personal data: a JWT is only signed, not encrypted,
                   and anyone holding it can read the payload.

   Refresh token — 7 days. Carries sub, sid and a jti. It is only
                   honoured while sid/jti match the session store,
                   which is what makes logout and rotation revoke it.

   Algorithm, issuer and audience are pinned on verify, so a token
   signed for something else — or with alg "none" — is rejected. The
   payload is then schema-checked rather than trusted by shape.
----------------------------------------------------------------*/

const ALGORITHM = "HS256";
const ISSUER = "swimato-api";
const AUDIENCE = "swimato-web";

export const ACCESS_TTL_SECONDS = env.ACCESS_TOKEN_TTL_MIN * 60;
export const REFRESH_TTL_SECONDS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

export interface AccessClaims {
  userId: string;
  role: Role;
  sid: string;
}

export interface RefreshClaims {
  userId: string;
  sid: string;
  jti: string;
}

const accessPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(ROLES),
  sid: z.string().min(1),
});

const refreshPayloadSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  jti: z.string().min(1),
});

const signOptions = (expiresIn: number): jwt.SignOptions => ({
  algorithm: ALGORITHM,
  issuer: ISSUER,
  audience: AUDIENCE,
  expiresIn,
});

const verifyOptions: jwt.VerifyOptions = {
  algorithms: [ALGORITHM],
  issuer: ISSUER,
  audience: AUDIENCE,
};

export const signAccessToken = ({ userId, role, sid }: AccessClaims) =>
  jwt.sign({ role, sid }, env.ACCESS_TOKEN_SECRET, {
    ...signOptions(ACCESS_TTL_SECONDS),
    subject: userId,
  });

export const signRefreshToken = ({ userId, sid, jti }: RefreshClaims) =>
  jwt.sign({ sid }, env.REFRESH_TOKEN_SECRET, {
    ...signOptions(REFRESH_TTL_SECONDS),
    subject: userId,
    jwtid: jti,
  });

// Expired, tampered, wrong key, wrong shape: all the same 401. The
// client's answer is identical in every case — refresh, or sign in.
function verify<Schema extends z.ZodType>(
  token: string,
  secret: string,
  schema: Schema,
): z.output<Schema> {
  let payload: unknown;
  try {
    payload = jwt.verify(token, secret, verifyOptions);
  } catch {
    // jsonwebtoken's error text says why (expired, bad signature); that
    // is useful to an attacker and useless to a legitimate client.
    throw new AuthenticationError();
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new AuthenticationError();
  return parsed.data;
}

export function verifyAccessToken(token: string): AccessClaims {
  const { sub, role, sid } = verify(
    token,
    env.ACCESS_TOKEN_SECRET,
    accessPayloadSchema,
  );
  return { userId: sub, role, sid };
}

export function verifyRefreshToken(token: string): RefreshClaims {
  const { sub, sid, jti } = verify(
    token,
    env.REFRESH_TOKEN_SECRET,
    refreshPayloadSchema,
  );
  return { userId: sub, sid, jti };
}
