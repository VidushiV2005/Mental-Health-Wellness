import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { query } from "./db";
import type { User } from "./types";
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, saved: string) {
  const [salt, hash] = saved.split(":");
  if (!salt || !hash) return false;
  const derived = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return (
    expected.length === derived.length && timingSafeEqual(derived, expected)
  );
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function cookieToken(req: Request) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("wellness_session="))
      ?.slice(17) || ""
  );
}
export async function getUser(req: Request): Promise<User | null> {
  const token = cookieToken(req);
  if (!token) return null;
  const rows = await query(
    "SELECT u.id, u.name, u.email, u.demo FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?",
    [digest(token), new Date().toISOString()],
  );
  const user = rows[0];
  return user
    ? {
        id: String(user.id),
        name: String(user.name),
        email: String(user.email),
        demo: Boolean(user.demo),
      }
    : null;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await query("DELETE FROM sessions WHERE expires_at <= ?", [
    new Date().toISOString(),
  ]);
  await query(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    [digest(token), userId, new Date(Date.now() + 7 * 86400000).toISOString()],
  );
  return sessionCookie(token, 604800);
}
export function sessionCookie(token: string, age: number) {
  return `wellness_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`;
}
export async function logout(req: Request) {
  await query("DELETE FROM sessions WHERE token = ?", [
    digest(cookieToken(req)),
  ]);
}
export async function createUser(
  name: string,
  email: string,
  password: string,
  demo = false,
): Promise<User> {
  const id = randomUUID();
  await query(
    "INSERT INTO users (id, name, email, password, demo, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      id,
      name,
      email,
      await hashPassword(password),
      demo ? 1 : 0,
      new Date().toISOString(),
    ],
  );
  return { id, name, email, demo };
}
