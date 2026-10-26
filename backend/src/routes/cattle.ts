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

export async function getCattle(user: AuthenticatedUser) {
  const where = user.role === "farmer" ? { farmer: { userId: user.userId } } : {};

  return prisma.cattle.findMany({
    where,
    include: {
      farmer: {
        include: {
          user: true,
        },
      },
      treatments: { orderBy: { administeredAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCattle(req: Request, user: AuthenticatedUser): Promise<Response> {
  try {
    // Only authenticated farmers may register cattle.
    if (user.role !== "farmer") {
      return json({ error: "Only farmers can register cattle." }, 403);
    }

    const body = await req.json();

    const cattleId = typeof body.cattleId === "string" ? body.cattleId.trim() : "";

    const name = typeof body.name === "string" ? body.name.trim() || null : null;

    const breed = typeof body.breed === "string" ? body.breed.trim() || null : null;

    const sex = typeof body.sex === "string" ? body.sex.trim() || null : null;

    if (!cattleId) {
      return json({ error: "Cattle ID is required." }, 400);
    }

    let dateOfBirth: Date | null = null;

    if (body.dateOfBirth) {
      if (typeof body.dateOfBirth !== "string") {
        return json({ error: "Invalid date of birth." }, 400);
      }

      dateOfBirth = new Date(body.dateOfBirth);

      if (Number.isNaN(dateOfBirth.getTime())) {
        return json({ error: "Invalid date of birth." }, 400);
      }

      if (dateOfBirth > new Date()) {
        return json({ error: "Date of birth cannot be in the future." }, 400);
      }
    }

    // Determine ownership from the authenticated account.
    const farmer = await prisma.farmer.findUnique({
      where: { userId: user.userId },
    });

    if (!farmer) {
      return json({ error: "No farmer profile is linked to this account." }, 403);
    }

    // Check whether THIS farmer has already used this cattle ID.
    const existingCattle = await prisma.cattle.findUnique({
      where: {
        farmerId_cattleId: {
          farmerId: farmer.id,
          cattleId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingCattle) {
      return json(
        {
          error: "You have already registered cattle with this ID.",
        },
        409,
      );
    }

    const cattle = await prisma.cattle.create({
      data: {
        cattleId,
        name,
        breed,
        sex,
        dateOfBirth,
        farmerId: farmer.id,
      },
      include: {
        farmer: {
          include: {
            user: true,
          },
        },
        treatments: { orderBy: { administeredAt: "desc" } },
      },
    });

    return json(
      {
        message: "Cattle registered successfully.",
        cattle,
      },
      201,
    );
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return json(
        {
          error: "You have already registered cattle with this ID.",
        },
        409,
      );
    }

    if (error instanceof SyntaxError) {
      return json({ error: "Invalid JSON request body." }, 400);
    }

    console.error("Failed to create cattle:", error);

    return json({ error: "Failed to register cattle." }, 500);
  }
}
