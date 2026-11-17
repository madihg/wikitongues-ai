import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { REGISTRATION_CLOSED_MESSAGE, isValidInvite } from "@/lib/registration";

const SELF_ASSIGNABLE_ROLES = ["LEARNER", "ANNOTATOR"] as const;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { email, name, password, role, invite } = (body ?? {}) as Record<
    string,
    string | undefined
  >;

  // Invitation first, before anything is read or written: the page hiding its
  // form proves nothing, anyone can post here.
  if (!isValidInvite(invite)) {
    return NextResponse.json(
      { error: REGISTRATION_CLOSED_MESSAGE },
      { status: 403 },
    );
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  const assignedRole =
    role && (SELF_ASSIGNABLE_ROLES as readonly string[]).includes(role)
      ? (role as (typeof SELF_ASSIGNABLE_ROLES)[number])
      : "ANNOTATOR";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 },
    );
  }

  const passwordHash = await hash(password, 12);

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: assignedRole,
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
