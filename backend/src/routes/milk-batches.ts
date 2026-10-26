import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../lib/auth-middleware";

const createSchema = z.object({
  cattleIds: z.array(z.string().trim().min(1)).min(1).max(500),
  volumeL: z.number().finite().positive(),
  date: z.string().datetime().optional(),
});

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function handleMilkBatchRequest(
  req: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  try {
    const centre = await prisma.collectionCentre.findUnique({
      where: { userId: user.userId },
    });
    if (!centre) {
      return json({ error: "No collection-centre profile is linked to this account." }, 403);
    }

    if (req.method === "GET") {
      const batches = await prisma.milkBatch.findMany({
        where: { collectionCentreId: centre.id },
        include: {
          collectionCentre: { select: { name: true, code: true } },
          contributingAnimals: {
            include: {
              cattle: {
                select: {
                  cattleId: true,
                  name: true,
                  farmer: { include: { user: { select: { name: true } } } },
                },
              },
            },
          },
          processingBatches: {
            include: {
              processingBatch: { select: { batchId: true, factory: { select: { name: true } } } },
            },
          },
        },
        orderBy: { date: "desc" },
        take: 500,
      });
      return json(batches);
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const body = createSchema.safeParse(await req.json());
    if (!body.success) {
      return json(
        {
          error: "Request validation failed.",
          details: body.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        400,
      );
    }
    if (new Set(body.data.cattleIds).size !== body.data.cattleIds.length) {
      return json({ error: "Each animal can only be included once." }, 400);
    }

    const batchDate = body.data.date ? new Date(body.data.date) : new Date();
    const cattle = await prisma.cattle.findMany({
      where: { id: { in: body.data.cattleIds } },
      include: {
        treatments: { orderBy: { administeredAt: "desc" }, take: 1 },
      },
    });
    if (cattle.length !== body.data.cattleIds.length) {
      return json({ error: "One or more selected animals were not found." }, 404);
    }

    const heldAnimal = cattle.find((animal) => {
      const latest = animal.treatments[0];
      return latest && (!latest.withdrawalEnds || latest.withdrawalEnds >= batchDate);
    });
    if (heldAnimal) {
      return json(
        {
          error: `Milk from ${heldAnimal.cattleId} cannot be pooled while its latest treatment withdrawal status is active or unconfirmed.`,
        },
        409,
      );
    }

    const batchId = `MB-${batchDate.toISOString().slice(0, 10).replace(/-/g, "")}-${crypto
      .randomUUID()
      .slice(0, 8)
      .toUpperCase()}`;
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.milkBatch.create({
        data: {
          batchId,
          collectionCentreId: centre.id,
          date: batchDate,
          volumeL: body.data.volumeL,
          status: "SAFE",
          contributingAnimals: {
            create: cattle.map((animal) => ({ cattleId: animal.id })),
          },
        },
        include: {
          contributingAnimals: { include: { cattle: { select: { cattleId: true } } } },
        },
      });
      await tx.traceabilityEvent.create({
        data: {
          eventType: "MILK_BATCH_CREATED",
          entityType: "milk_batch",
          entityId: created.id,
          payload: {
            batchId,
            collectionCentreId: centre.id,
            volumeL: body.data.volumeL,
            contributingCattleIds: cattle.map((animal) => animal.cattleId),
          },
        },
      });
      return created;
    });
    return json({ milkBatch: batch }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json({ error: "Request body must be valid JSON." }, 400);
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return json({ error: "Could not create a unique milk batch ID. Please retry." }, 409);
    }
    console.error("Milk batch request failed:", error);
    return json({ error: "Milk batch request failed." }, 500);
  }
}
