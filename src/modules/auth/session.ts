import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { SESSION_MAX_AGE } from "@/lib/auth/session-cookie";

export interface SessionWithUser {
  session: {
    id: string;
    sessionToken: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
}

/**
 * Creates a new active database session for a user.
 */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await prisma.session.create({
    data: {
      userId,
      sessionToken,
      expiresAt,
    },
  });

  return { token: sessionToken, expiresAt };
}

/**
 * Validates a session token and returns the associated user if valid.
 */
export async function validateSession(sessionToken: string): Promise<SessionWithUser | null> {
  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
        },
      },
    },
  });

  if (!session) return null;

  // Check expiration
  if (session.expiresAt.getTime() < Date.now()) {
    // Delete expired session asynchronously
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Extend session expiration if within last 7 days (sliding window)
  const timeRemaining = session.expiresAt.getTime() - Date.now();
  if (timeRemaining < 7 * 24 * 60 * 60 * 1000) {
    const newExpiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpiresAt },
    }).catch(() => {});
  }

  return {
    session: {
      id: session.id,
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
    },
    user: session.user,
  };
}

/**
 * Invalidates and deletes a session token.
 */
export async function invalidateSession(sessionToken: string): Promise<void> {
  if (!sessionToken) return;
  await prisma.session.deleteMany({
    where: { sessionToken },
  }).catch(() => {});
}

/**
 * Invalidates all sessions for a user (e.g. password reset / logout all devices).
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId },
  });
}
