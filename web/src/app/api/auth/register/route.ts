import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

const SELF_ASSIGNABLE_ROLES = ["LEARNER", "ANNOTATOR"] as const;

export async function POST(req: Request) {
  const { email, name, password, role } = await req.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  const assignedRole =
    role && SELF_ASSIGNABLE_ROLES.includes(role) ? role : "ANNOTATOR";

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
