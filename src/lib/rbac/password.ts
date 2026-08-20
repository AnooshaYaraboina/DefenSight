import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * Password hashing with scrypt.
 *
 * scrypt is memory-hard and ships in Node's standard library, so DefenSight
 * needs no native build step to store credentials correctly. Format is
 * `salt:derivedKey`, both hex.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time verification. Returns false rather than throwing on bad input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    const actual = await scrypt(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
