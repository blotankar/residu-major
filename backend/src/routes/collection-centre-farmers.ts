import { Prisma } from "../../generated/prisma/client";
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function getCentre(user: AuthenticatedUser) {
  return prisma.collectionCentre.findUnique({
    where: { userId: user.userId },
    select: {
      id: true,
      name: true,
      code: true,
    },
  });
}

export async function handleCollectionCentreFarmerRequest(
  req: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  try {
    const centre = await getCentre(user);

    if (!centre) {
      return json(
        { error: "No collection-centre profile is linked to this account." },
        403,
      );
    }

    const url = new URL(req.url);

    // ==========================================
    // GET: SEARCH FARMERS BY ID OR NAME
    // Returns all registered cattle belonging
    // to each matching farmer.
    // ==========================================

    if (
      req.method === "GET" &&
      url.pathname === "/api/collection-centre/farmers/search"
    ) {
      const search = (url.searchParams.get("search") ?? "").trim();

      if (!search) {
        return json(
          { error: "Enter a Farmer ID or farmer name." },
          400,
        );
      }

      if (search.length > 200) {
        return json({ error: "Search query is too long." }, 400);
      }

      const farmerConditions: Prisma.FarmerWhereInput[] = [
        {
          user: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      ];

      if (isUuid(search)) {
        farmerConditions.push(
          { id: search },
          { userId: search },
        );
      }

      const farmers = await prisma.farmer.findMany({
        where: {
          OR: farmerConditions,
        },

        select: {
          id: true,
          userId: true,
          village: true,
          phone: true,

          user: {
            select: {
              name: true,
            },
          },

          cattle: {
            select: {
              id: true,
              cattleId: true,
              name: true,
              collectionCentreId: true,
            },
            orderBy: {
              cattleId: "asc",
            },
          },
        },

        take: 50,

        orderBy: {
          createdAt: "desc",
        },
      });

      return json(
        farmers.map((farmer) => ({
          id: farmer.id,
          userId: farmer.userId,
          name: farmer.user.name,
          village: farmer.village,
          phone: farmer.phone,

          cattle: farmer.cattle.map((cow) => ({
            id: cow.id,
            cattleId: cow.cattleId,
            name: cow.name,

            assignedToThisCentre:
              cow.collectionCentreId === centre.id,

            assignedToAnotherCentre:
              cow.collectionCentreId !== null &&
              cow.collectionCentreId !== centre.id,
          })),
        })),
      );
    }

    // ==========================================
    // POST: ASSIGN SELECTED CATTLE TO CENTRE
    // ==========================================

    if (
      req.method === "POST" &&
      url.pathname === "/api/collection-centre/cattle/assign"
    ) {
      let input: unknown;

      try {
        input = await req.json();
      } catch {
        return json(
          { error: "Request body must be valid JSON." },
          400,
        );
      }

      if (
        typeof input !== "object" ||
        input === null ||
        !("cattleIds" in input) ||
        !Array.isArray(input.cattleIds) ||
        input.cattleIds.length === 0 ||
        !input.cattleIds.every(
          (id: unknown) => typeof id === "string" && isUuid(id),
        )
      ) {
        return json(
          { error: "Select at least one valid cow." },
          400,
        );
      }

      const cattleIds = [
        ...new Set(input.cattleIds as string[]),
      ];

      if (cattleIds.length > 200) {
        return json(
          { error: "You can assign a maximum of 200 cows at once." },
          400,
        );
      }

      const cattle = await prisma.cattle.findMany({
        where: {
          id: { in: cattleIds },
        },
        select: {
          id: true,
          cattleId: true,
          collectionCentreId: true,
        },
      });

      if (cattle.length !== cattleIds.length) {
        return json(
          { error: "Some selected cattle records could not be found." },
          404,
        );
      }

      const assignedElsewhere = cattle.filter(
        (cow) =>
          cow.collectionCentreId !== null &&
          cow.collectionCentreId !== centre.id,
      );

      if (assignedElsewhere.length > 0) {
        return json(
          {
            error:
              "Some selected cows are already assigned to another collection centre. Refresh your search and try again.",
            cattleIds: assignedElsewhere.map((cow) => cow.cattleId),
          },
          409,
        );
      }

      const unassignedIds = cattle
        .filter((cow) => cow.collectionCentreId === null)
        .map((cow) => cow.id);

      if (unassignedIds.length === 0) {
        return json({
          message: "All selected cows are already assigned to your centre.",
          assignedCount: 0,
        });
      }

      try {
        await prisma.$transaction(async (tx) => {
          const result = await tx.cattle.updateMany({
            where: {
              id: { in: unassignedIds },
              collectionCentreId: null,
            },
            data: {
              collectionCentreId: centre.id,
            },
          });

          if (result.count !== unassignedIds.length) {
            throw new Error("CATTLE_ASSIGNMENT_CONFLICT");
          }

          await tx.traceabilityEvent.createMany({
            data: unassignedIds.map((cattleId) => ({
              eventType: "CATTLE_ASSIGNED_TO_COLLECTION_CENTRE",
              entityType: "cattle",
              entityId: cattleId,
              payload: {
                cattleId,
                collectionCentreId: centre.id,
                collectionCentreCode: centre.code,
              },
            })),
          });
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "CATTLE_ASSIGNMENT_CONFLICT"
        ) {
          return json(
            {
              error:
                "One or more cows were assigned by another centre. Search again.",
            },
            409,
          );
        }

        throw error;
      }

      return json({
        message: `${unassignedIds.length} cow(s) successfully added to your collection centre.`,
        assignedCount: unassignedIds.length,
      });
    }

    return json({ error: "Route not found." }, 404);
  } catch (error) {
    console.error(
      "Collection-centre cattle request failed:",
      error,
    );

    return json(
      { error: "Unable to process the collection-centre request." },
      500,
    );
  }
}