import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";
import type { Role } from "@/lib/engine/taxonomy";
import type { SessionUser } from "./session";

/**
 * Session management (§24).
 *
 * The session cookie carries a signed JWT for fast, stateless reads, *and* a
 * server-side session row that can be revoked. The JWT alone would be
 * unrevocable until expiry — unacceptable for a security console, where
 * suspending an account has to take effect immediately rather than in an hour.
 * Every request therefore verifies the signature and confirms the session row
 * still exists and the account is still active.
 */

const COOKIE = "defensight_session";
const SESSION_HOURS = 8;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    // Failing loudly beats silently signing with a predictable key.
    throw new Error(
      "SESSION_SECRET is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }
  return new TextEncoder().encode(value);
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  user?: SessionUser;
}

export async function signIn(
  email: string,
  password: string,
  context: { ipAddress?: string; userAgent?: string } = {},
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  // Verify a hash even when the account is unknown, so response timing does not
  // reveal which addresses exist.
  const stored = user?.password ?? "0".repeat(32) + ":" + "0".repeat(128);
  const valid = await verifyPassword(password, stored);

  if (!user || !valid) {
    if (user) {
      await prisma.auditLog.create({
        data: {
          actorId: user.id, actorName: user.name, actorRole: user.role,
          action: "auth.sign_in", category: "AUTH",
          description: `Failed sign-in for ${user.email}: incorrect password.`,
          ipAddress: context.ipAddress ?? null,
          outcome: "FAILURE",
        },
      });
    }
    return { ok: false, error: "Incorrect email or password." };
  }

  if (user.status !== "ACTIVE") {
    await prisma.auditLog.create({
      data: {
        actorId: user.id, actorName: user.name, actorRole: user.role,
        action: "auth.sign_in", category: "AUTH",
        description: `Sign-in refused for ${user.email}: account is ${user.status.toLowerCase()}.`,
        ipAddress: context.ipAddress ?? null,
        outcome: "FAILURE",
      },
    });
    return { ok: false, error: `This account is ${user.status.toLowerCase()}.` };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    },
  });

  const jwt = await new SignJWT({ sub: user.id, token, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  await Promise.all([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        actorId: user.id, actorName: user.name, actorRole: user.role,
        action: "auth.sign_in", category: "AUTH",
        description: `${user.name} signed in as ${user.role.replace(/_/g, " ").toLowerCase()}.`,
        ipAddress: context.ipAddress ?? null,
        outcome: "SUCCESS",
      },
    }),
  ]);

  return {
    ok: true,
    user: {
      id: user.id, name: user.name, email: user.email,
      role: user.role as Role, department: user.department,
      clearance: user.clearance,
    },
  };
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const jwt = store.get(COOKIE)?.value;

  if (jwt) {
    try {
      const { payload } = await jwtVerify(jwt, secret());
      const token = payload.token as string | undefined;
      if (token) {
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { id: true, name: true, role: true } } },
        });
        if (session) {
          await prisma.session.delete({ where: { token } });
          await prisma.auditLog.create({
            data: {
              actorId: session.user.id, actorName: session.user.name, actorRole: session.user.role,
              action: "auth.sign_out", category: "AUTH",
              description: `${session.user.name} signed out.`,
              outcome: "SUCCESS",
            },
          });
        }
      }
    } catch {
      // An unverifiable cookie is cleared regardless — there is nothing to
      // revoke, and leaving it in place helps nobody.
    }
  }

  store.delete(COOKIE);
}

/** Resolve the acting user, or null when not signed in. */
export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const jwt = store.get(COOKIE)?.value;
  if (!jwt) return null;

  try {
    const { payload } = await jwtVerify(jwt, secret());
    const token = payload.token as string | undefined;
    if (!token) return null;

    // The signature proves the cookie is ours; the row proves it is still
    // valid. Both are required.
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { token } }).catch(() => {});
      return null;
    }
    if (session.user.status !== "ACTIVE") return null;

    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role as Role,
      department: session.user.department,
      clearance: session.user.clearance,
    };
  } catch {
    return null;
  }
}

/** Remove expired rows. Called opportunistically on sign-in pages. */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.session
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});
}

export { COOKIE as SESSION_COOKIE };
