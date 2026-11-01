
import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../lib/auth-middleware";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

export async function handleMrlRequest(
  req: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (
    ![
      "farmer",
      "veterinarian",
      "authority",
      "collection_centre",
    ].includes(user.role)
  ) {
    return json(
      { error: "You are not authorized to view MRL references." },
      403,
    );
  }

  try {
    const references = await prisma.medicineMRL.findMany({
      where: {
        OR: [
          { isDashboardEnabled: true },
          { isScreeningEnabled: true },
        ],
      },
      orderBy: {
        medicineName: "asc",
      },
    });

    return json(references);
  } catch (error) {
    console.error("Failed to fetch MRL references:", error);
    return json({ error: "Failed to fetch MRL references." }, 500);
  }
}
