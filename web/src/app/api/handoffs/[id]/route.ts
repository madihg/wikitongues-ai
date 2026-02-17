import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const item = await prisma.handoffItem.findUnique({
    where: { id },
    include: {
      reviewer: { select: { name: true, email: true } },
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

const TERMINAL_STATUSES = new Set(["approved", "corrected", "rejected"]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action, correctedAnswer, reason } = body;

  if (!action || !["approve", "correct", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be approve, correct, or reject." },
      { status: 400 },
    );
  }

  if (action === "correct" && !correctedAnswer) {
    return NextResponse.json(
      { error: "correctedAnswer is required for correct action" },
      { status: 400 },
    );
  }

  if (action === "reject" && !reason) {
    return NextResponse.json(
      { error: "reason is required for reject action" },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.handoffItem.findUnique({
      where: { id },
    });

    if (!current) {
      return null;
    }

    if (TERMINAL_STATUSES.has(current.status)) {
      return { conflict: true, status: current.status };
    }

    const statusMap = {
      approve: "approved" as const,
      correct: "corrected" as const,
      reject: "rejected" as const,
    };

    const data: Parameters<typeof tx.handoffItem.update>[0]["data"] = {
      status: statusMap[action as keyof typeof statusMap],
      reviewerId: session.user.id,
      reviewedAt: new Date(),
    };

    if (action === "correct") {
      data.correctedAnswer = correctedAnswer;
      data.verificationStatus = "single_annotator";
    }

    if (action === "reject") {
      data.reviewerReasoning = reason;
    }

    return tx.handoffItem.update({
      where: { id },
      data,
      include: {
        reviewer: { select: { name: true, email: true } },
      },
    });
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if ("conflict" in updated) {
    return NextResponse.json(
      { error: `Item already resolved with status: ${updated.status}` },
      { status: 409 },
    );
  }

  return NextResponse.json(updated);
}
