
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../lib/auth-middleware";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

export async function handleTreatmentRequest(
  req: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  if (req.method === "GET") {
    if (user.role !== "veterinarian") {
    return json(
      { error: "Only veterinarians can view treatment records." },
      403,
    );
  }
    try {
      const treatments = await prisma.treatment.findMany({
        include: {
          cattle: {
            select: {
              id: true,
              cattleId: true,
              name: true,
            },
          },
          medicineMrl: true,
        },
        orderBy: { administeredAt: "desc" },
      });

      return json(treatments);
    } catch (error) {
      console.error("Failed to fetch treatments:", error);
      return json({ error: "Failed to fetch treatments." }, 500);
    }
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (user.role !== "veterinarian") {
    return json(
      { error: "Only veterinarians can record treatments." },
      403,
    );
  }

  try {
    const body = await req.json();

    const cattleId =
      typeof body.cattleId === "string"
        ? body.cattleId.trim()
        : "";

    const medicineName =
      typeof body.medicineName === "string"
        ? body.medicineName.trim()
        : "";

    const dosage =
      typeof body.dosage === "string"
        ? body.dosage.trim()
        : "";

    const reason =
      typeof body.reason === "string"
        ? body.reason.trim()
        : "";

    if (!cattleId || !medicineName || !dosage || !reason) {
      return json(
        {
          error:
            "Cattle, medicine, dosage, and reason are required.",
        },
        400,
      );
    }

    if (
      medicineName.length > 200 ||
      dosage.length > 200 ||
      reason.length > 1000
    ) {
      return json(
        { error: "One or more fields are too long." },
        400,
      );
    }

    if (typeof body.administeredAt !== "string") {
      return json(
        { error: "Administration date is required." },
        400,
      );
    }

    const administeredAt = new Date(body.administeredAt);

    if (Number.isNaN(administeredAt.getTime())) {
      return json(
        { error: "Invalid administration date." },
        400,
      );
    }

    if (administeredAt > new Date()) {
      return json(
        { error: "Administration date cannot be in the future." },
        400,
      );
    }

    let withdrawalEnds: Date | null = null;

    if (
      body.withdrawalEnds !== null &&
      body.withdrawalEnds !== undefined &&
      body.withdrawalEnds !== ""
    ) {
      if (typeof body.withdrawalEnds !== "string") {
        return json(
          { error: "Invalid withdrawal end date." },
          400,
        );
      }

      withdrawalEnds = new Date(body.withdrawalEnds);

      if (Number.isNaN(withdrawalEnds.getTime())) {
        return json(
          { error: "Invalid withdrawal end date." },
          400,
        );
      }

      if (withdrawalEnds < administeredAt) {
        return json(
          {
            error:
              "Withdrawal end date cannot be before administration.",
          },
          400,
        );
      }
    }

    const veterinarian = await prisma.veterinarian.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });

    if (!veterinarian) {
      return json(
        {
          error:
            "No veterinarian profile is linked to this account.",
        },
        403,
      );
    }

    const cattle = await prisma.cattle.findUnique({
      where: { id: cattleId },
      select: { id: true },
    });

    if (!cattle) {
      return json(
        { error: "Selected cattle was not found." },
        404,
      );
    }

    // Look up the medicine's MRL record.
    // A missing match does not prevent treatment registration.
    const medicineMrl = await prisma.medicineMRL.findFirst({
      where: {
        medicineName: {
          equals: medicineName,
          mode: "insensitive",
        },
        isDashboardEnabled: true,
      },
    });

    const treatment = await prisma.treatment.create({
      data: {
        cattleId: cattle.id,
        veterinarianId: veterinarian.id,
        medicineName,
        medicineMrlId: medicineMrl?.id ?? null,
        dosage,
        administeredAt,
        withdrawalEnds,
        reason,
      },
      include: {
        cattle: {
          select: {
            id: true,
            cattleId: true,
            name: true,
          },
        },
        medicineMrl: true,
      },
    });

    return json(
      {
        message: "Treatment recorded successfully.",
        treatment,
      },
      201,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json(
        { error: "Invalid JSON request body." },
        400,
      );
    }

    console.error("Failed to record treatment:", error);

    return json(
      { error: "Failed to record treatment." },
      500,
    );
  }
}
