import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const python = path.join(repoRoot, "backend/.venv/bin/python");
const script = path.join(repoRoot, "scripts/e2e_db.py");

async function runE2eDb(args: string[]): Promise<unknown> {
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.E2E_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://day2:day2@localhost:5432/day2",
  };
  const { stdout } = await execFileAsync(python, [script, ...args], {
    env,
    maxBuffer: 2 * 1024 * 1024,
  });
  const text = stdout.trim();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

export async function verifyEmail(email: string): Promise<void> {
  await runE2eDb(["verify-email", "--email", email]);
}

export async function setUserPassword(email: string, password: string): Promise<void> {
  await runE2eDb(["set-user-password", "--email", email, "--password", password]);
}

export async function createStaffUser(opts: {
  email: string;
  password: string;
  role: "user" | "editor" | "admin";
  nickname?: string;
}): Promise<{ id: string; email: string; role: string }> {
  const args = [
    "create-staff-user",
    "--email",
    opts.email,
    "--password",
    opts.password,
    "--role",
    opts.role,
  ];
  if (opts.nickname) {
    args.push("--nickname", opts.nickname);
  }
  return (await runE2eDb(args)) as { id: string; email: string; role: string };
}

export async function cleanupTestData(opts: { email?: string }): Promise<void> {
  const args = ["cleanup"];
  if (opts.email) {
    args.push("--email", opts.email);
  }
  await runE2eDb(args);
}
