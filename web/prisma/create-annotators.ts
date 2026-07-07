/**
 * Create ANNOTATOR accounts with strong random passwords, ready to hand out.
 *
 * Usage (from web/):
 *   npm run create:annotators -- alice@example.com "bob@example.com:Bob Ojo"
 *   npm run create:annotators -- --file emails.txt
 *   npm run create:annotators -- --reset alice@example.com   # reset an existing pw
 *
 * Each entry is "email" or "email:Full Name". With --file, one entry per line
 * (blank lines and lines starting with # are ignored). Existing accounts are
 * left untouched (password shown as "(unchanged)") unless you pass --reset.
 * Every created annotator is assigned Igala (native) so the queue works for them.
 *
 * The script prints a credentials table at the end. Copy it, share each password
 * over a private channel, and then delete the output — it is the only time the
 * plaintext password is shown (only the bcrypt hash is stored).
 *
 * Requires DATABASE_URL to point at the target database (same as the seed).
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

// Unambiguous alphabet — no 0/O/1/l/I — so passwords are easy to read and type.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function strongPassword(len = 14): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

interface Entry {
  email: string;
  name: string | null;
}

function parseEntry(raw: string): Entry | null {
  const s = raw.trim();
  if (!s || s.startsWith("#")) return null;
  const idx = s.indexOf(":");
  const email = (idx === -1 ? s : s.slice(0, idx)).trim().toLowerCase();
  const name = idx === -1 ? null : s.slice(idx + 1).trim() || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.warn(`Skipping invalid email: "${raw}"`);
    return null;
  }
  return { email, name };
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const rest = args.filter((a) => a !== "--reset");

  const raws: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--file") {
      const path = rest[++i];
      if (!path) throw new Error("--file needs a path");
      raws.push(...readFileSync(path, "utf8").split(/\r?\n/));
    } else {
      raws.push(rest[i]);
    }
  }

  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const r of raws) {
    const e = parseEntry(r);
    if (e && !seen.has(e.email)) {
      seen.add(e.email);
      entries.push(e);
    }
  }

  if (entries.length === 0) {
    console.error(
      'No valid emails given.\nUsage: npm run create:annotators -- alice@example.com "bob@example.com:Bob Ojo"',
    );
    process.exit(1);
  }

  const results: { email: string; password: string; note: string }[] = [];

  for (const { email, name } of entries) {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing && !reset) {
      results.push({
        email,
        password: "(unchanged)",
        note: `already exists — role ${existing.role}`,
      });
      continue;
    }

    const password = strongPassword();
    const passwordHash = await hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, ...(name ? { name } : {}) },
      create: {
        email,
        name: name ?? email.split("@")[0],
        passwordHash,
        role: "ANNOTATOR",
      },
    });
    // Every annotator on this project is an Igala native speaker.
    await prisma.annotatorLanguage.upsert({
      where: { userId_language: { userId: user.id, language: "igala" } },
      update: {},
      create: { userId: user.id, language: "igala", expertiseLevel: "native" },
    });
    results.push({
      email,
      password,
      note: existing ? "password reset" : "created",
    });
  }

  const w = Math.max(...results.map((r) => r.email.length), 5);
  console.log("\n=== Annotator credentials — sign in at /login ===");
  console.log(`${"EMAIL".padEnd(w)}  ${"PASSWORD".padEnd(14)}  NOTE`);
  console.log(`${"-".repeat(w)}  ${"-".repeat(14)}  ----`);
  for (const r of results) {
    console.log(`${r.email.padEnd(w)}  ${r.password.padEnd(14)}  ${r.note}`);
  }
  console.log(
    `\n${results.length} account(s) processed. Share each password privately, then delete this output.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
