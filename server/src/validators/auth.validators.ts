import { z } from "zod";

/* ---------------------------------------------------------------
   Auth request bodies

   Mirrors the frontend's Yup rules, but this is the copy that
   counts — the browser's checks are a convenience, not a guard.
   Every object is strict: an unexpected key (say, "role") is a 400,
   not something silently ignored, so mass assignment cannot creep in
   through a future spread of req.body.
----------------------------------------------------------------*/

const MAX_EMAIL_LENGTH = 254; // RFC 5321 path limit
const BCRYPT_MAX_BYTES = 72;
// Login must not reveal the signup rules, but it still bounds what it
// will hash: bcrypt reads 72 bytes, anything past a few hundred is abuse.
const MAX_LOGIN_PASSWORD_LENGTH = 256;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH, "Email is too long")
  .pipe(z.email("Enter a valid email"));

// bcrypt only reads the first 72 *bytes*; anything past that would be
// silently ignored, so it is refused instead. Bytes, not characters,
// because an emoji is four of them.
export const newPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= BCRYPT_MAX_BYTES,
    `Password must be at most ${BCRYPT_MAX_BYTES} bytes`,
  )
  .refine(
    (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
    "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  );

const existingPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .max(MAX_LOGIN_PASSWORD_LENGTH, "Password is too long");

export const signupSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(2, "Name is too short")
    .max(50, "Name is too long"),
  email: emailSchema,
  password: newPasswordSchema,
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: existingPasswordSchema,
});

export const changePasswordSchema = z
  .strictObject({
    currentPassword: existingPasswordSchema,
    newPassword: newPasswordSchema,
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current one",
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
