import { z } from "zod";
import {
  REFRESH_COOKIE_PATH,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from "../config/cookies.js";
import { API_PREFIX, PAGINATION } from "../constants/http.js";
import { ERROR_CODES, type ErrorCode } from "../constants/errorCodes.js";
import { ROLES } from "../constants/roles.js";
import {
  changePasswordSchema,
  loginSchema,
  signupSchema,
} from "../validators/auth.validators.js";

/* ---------------------------------------------------------------
   OpenAPI 3.1 document

   Request bodies are generated from the same zod schemas the
   controllers validate with, so the docs cannot drift from the code
   on what input is accepted.
----------------------------------------------------------------*/

const bodySchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });

const json = (schema: unknown) => ({ "application/json": { schema } });

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

// What each code's message typically says, for the per-response examples.
const EXAMPLE_MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.VALIDATION_FAILED]: "Validation failed",
  [ERROR_CODES.AUTHENTICATION_REQUIRED]: "Not authenticated",
  [ERROR_CODES.INVALID_CREDENTIALS]: "Invalid email or password",
  [ERROR_CODES.SESSION_REVOKED]: "Session expired, please sign in again",
  [ERROR_CODES.FORBIDDEN]: "You do not have access to this resource",
  [ERROR_CODES.EMAIL_TAKEN]: "An account with this email already exists",
  [ERROR_CODES.MENU_NOT_FOUND]: "No menu is available for this restaurant",
  [ERROR_CODES.RATE_LIMITED]: "Too many requests, try again later",
};

const EXAMPLE_REQUEST_ID = "3f1c2b9e-5a7d-4e2a-9c1b-2d4e6f8a0b1c";

// Every error response gets its own example, built from its first code,
// so the 404 on a menu shows MENU_NOT_FOUND rather than a generic sample.
const errorResponse = (
  description: string,
  codes: [ErrorCode, ...ErrorCode[]],
) => {
  const [code] = codes;
  const example = {
    success: false,
    error: {
      code,
      message: EXAMPLE_MESSAGES[code] ?? description,
      ...(code === ERROR_CODES.VALIDATION_FAILED
        ? { details: [{ field: "email", message: "Enter a valid email" }] }
        : {}),
    },
    requestId: EXAMPLE_REQUEST_ID,
  };

  return {
    description: `${description}. Possible codes: ${codes.join(", ")}.`,
    content: { "application/json": { schema: ref("Error"), example } },
  };
};

const userEnvelope = {
  description: "The signed-in user",
  content: json({
    type: "object",
    required: ["success", "data"],
    properties: {
      success: { const: true },
      data: {
        type: "object",
        required: ["user"],
        properties: { user: ref("User") },
      },
    },
  }),
};

const setsCookies = {
  "Set-Cookie": {
    description: `${ACCESS_COOKIE} (path /, 15 min) and ${REFRESH_COOKIE} (path ${REFRESH_COOKIE_PATH}, 7 days), both HttpOnly.`,
    schema: { type: "string" },
  },
};

const unauthorized = errorResponse("Not signed in, or the session ended", [
  ERROR_CODES.AUTHENTICATION_REQUIRED,
  ERROR_CODES.SESSION_REVOKED,
]);
const validation = errorResponse("Invalid input", [
  ERROR_CODES.VALIDATION_FAILED,
  ERROR_CODES.INVALID_JSON,
]);
const rateLimited = errorResponse("Rate limit hit", [ERROR_CODES.RATE_LIMITED]);

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Swimato API",
    version: "1.0.0",
    description:
      "Authentication is cookie-based: sign up or log in and the browser stores two HttpOnly cookies that it sends automatically. " +
      "When a request returns 401, call POST /auth/refresh once and retry. " +
      "State-changing requests from a browser must come from an allowed Origin. " +
      "Every error has the shape { success: false, error: { code, message, details? }, requestId }; branch on `code`, not `message`.",
  },
  servers: [{ url: API_PREFIX }],
  tags: [{ name: "Auth" }, { name: "Restaurants" }, { name: "Admin" }],
  components: {
    securitySchemes: {
      accessCookie: { type: "apiKey", in: "cookie", name: ACCESS_COOKIE },
      refreshCookie: { type: "apiKey", in: "cookie", name: REFRESH_COOKIE },
    },
    schemas: {
      RestaurantSummary: {
        type: "object",
        required: ["id", "name", "city", "areaName", "cuisines"],
        properties: {
          id: { type: "string", example: "47120" },
          name: { type: "string" },
          city: { type: "string" },
          areaName: { type: "string" },
          cuisines: { type: "array", items: { type: "string" } },
        },
      },
      MenuItem: {
        type: "object",
        required: [
          "id",
          "name",
          "description",
          "imageId",
          "isVeg",
          "pricePaise",
          "rating",
          "ratingCount",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          imageId: {
            type: ["string", "null"],
            description: "Swiggy CDN image id",
          },
          isVeg: { type: "boolean" },
          pricePaise: {
            type: "integer",
            description: "Price in paise (₹1 = 100)",
            example: 18900,
          },
          rating: { type: ["number", "null"], minimum: 0, maximum: 5 },
          ratingCount: { type: ["integer", "null"] },
        },
      },
      MenuCategory: {
        type: "object",
        required: ["id", "title", "items"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          items: { type: "array", items: ref("MenuItem") },
        },
      },
      User: {
        type: "object",
        required: ["id", "name", "email", "role", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: [...ROLES] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        required: ["success", "error", "requestId"],
        properties: {
          success: { const: false },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", enum: Object.values(ERROR_CODES) },
              message: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  required: ["field", "message"],
                  properties: {
                    field: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Create an account and sign in",
        requestBody: {
          required: true,
          content: json(bodySchema(signupSchema)),
        },
        responses: {
          201: { ...userEnvelope, headers: setsCookies },
          400: validation,
          409: errorResponse("Email already registered", [
            ERROR_CODES.EMAIL_TAKEN,
          ]),
          429: rateLimited,
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Sign in",
        requestBody: { required: true, content: json(bodySchema(loginSchema)) },
        responses: {
          200: { ...userEnvelope, headers: setsCookies },
          400: validation,
          401: errorResponse("Wrong email or password", [
            ERROR_CODES.INVALID_CREDENTIALS,
          ]),
          429: rateLimited,
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate the refresh token and issue a new access token",
        security: [{ refreshCookie: [] }],
        responses: {
          200: { ...userEnvelope, headers: setsCookies },
          401: errorResponse("Refresh token missing, invalid or reused", [
            ERROR_CODES.AUTHENTICATION_REQUIRED,
            ERROR_CODES.SESSION_REVOKED,
          ]),
          429: rateLimited,
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "End this session and clear cookies (always succeeds)",
        responses: { 204: { description: "Signed out" } },
      },
    },
    "/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "End every session of the current user",
        security: [{ accessCookie: [] }],
        responses: {
          204: { description: "All sessions ended" },
          401: unauthorized,
        },
      },
    },
    "/auth/password": {
      patch: {
        tags: ["Auth"],
        summary: "Change password; ends every other session",
        security: [{ accessCookie: [] }],
        requestBody: {
          required: true,
          content: json(bodySchema(changePasswordSchema)),
        },
        responses: {
          204: { description: "Password changed" },
          400: validation,
          401: errorResponse("Not signed in, or current password wrong", [
            ERROR_CODES.AUTHENTICATION_REQUIRED,
            ERROR_CODES.SESSION_REVOKED,
            ERROR_CODES.INVALID_CREDENTIALS,
          ]),
          429: rateLimited,
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "The signed-in user",
        security: [{ accessCookie: [] }],
        responses: { 200: userEnvelope, 401: unauthorized },
      },
    },
    "/restaurants/{restaurantId}/menu": {
      get: {
        tags: ["Restaurants"],
        summary: "A restaurant's menu, grouped into categories (public)",
        description:
          "Until every restaurant has its own menu, a restaurant without one gets the sample menu of restaurant 47120, with `isSample: true` and `menuOf` naming the real owner. Cacheable for 5 minutes.",
        parameters: [
          {
            name: "restaurantId",
            in: "path",
            required: true,
            description: "Numeric restaurant id, e.g. 47120",
            schema: { type: "string", example: "47120" },
          },
        ],
        responses: {
          200: {
            description: "The menu",
            content: json({
              type: "object",
              required: ["success", "data"],
              properties: {
                success: { const: true },
                data: {
                  type: "object",
                  required: [
                    "restaurantId",
                    "isSample",
                    "menuOf",
                    "categories",
                  ],
                  properties: {
                    restaurantId: { type: "string" },
                    isSample: { type: "boolean" },
                    menuOf: ref("RestaurantSummary"),
                    categories: { type: "array", items: ref("MenuCategory") },
                  },
                },
              },
            }),
          },
          400: validation,
          404: errorResponse("No menu available", [ERROR_CODES.MENU_NOT_FOUND]),
        },
      },
    },
    "/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "List users, oldest first (admin only)",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: PAGINATION.MAX_LIMIT,
              default: PAGINATION.DEFAULT_LIMIT,
            },
          },
          {
            name: "cursor",
            in: "query",
            description:
              "Opaque; pass back `nextCursor` from the previous page.",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "A page of users",
            content: json({
              type: "object",
              properties: {
                success: { const: true },
                data: {
                  type: "object",
                  required: ["users", "nextCursor"],
                  properties: {
                    users: { type: "array", items: ref("User") },
                    nextCursor: { type: ["string", "null"] },
                  },
                },
              },
            }),
          },
          400: validation,
          401: unauthorized,
          403: errorResponse("Not an admin", [ERROR_CODES.FORBIDDEN]),
        },
      },
    },
  },
} as const;
