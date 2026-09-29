import bcrypt from "bcrypt";
import { env } from "../config/env.js";

/* ---------------------------------------------------------------
   Password hashing

   bcrypt embeds its own salt and cost in the hash string, so the
   stored value is all that is needed to verify later — and raising
   BCRYPT_ROUNDS only affects hashes made from then on.
----------------------------------------------------------------*/

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, env.BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

// Login compares against this when the email is unknown, so a miss
// costs the same as a wrong password; otherwise response time alone
// would reveal which emails have accounts. Hashed once at boot, so
// even the first miss does not pay for creating it.
const dummyHash = hashPassword("timing-equaliser-not-a-real-password");

export async function burnPasswordCheck(plain: string): Promise<void> {
  await bcrypt.compare(plain, await dummyHash);
}
