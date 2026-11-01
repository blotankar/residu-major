
import { getCattle, createCattle } from "./routes/cattle";
import { login, register } from "./routes/auth";
import { handleFactoryRequest } from "./routes/factory";
import { handleMrlRequest } from "./routes/mrl";
import { handleTreatmentRequest } from "./routes/treatments";
import { handleCollectionCentreFarmerRequest } from "./routes/collection-centre-farmers";
import {
  authenticateRequest,
  requireRoles,
} from "./lib/auth-middleware";
import {
  handleMilkBatchRequest,
  handleResidueScreeningRequest,
} from "./routes/milk-batches";
import { handleTraceabilityRequest } from "./routes/traceability";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const server = Bun.serve({
  port: 3000,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle CORS preflight requests.
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // ---------------- AUTHENTICATION ----------------

    // Register
    if (req.method === "POST" && path === "/api/auth/register") {
      const response = await register(req);

      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // Login
    if (req.method === "POST" && path === "/api/auth/login") {
      const response = await login(req);

      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // ---------------- CATTLE ----------------

    if (
      (req.method === "GET" || req.method === "POST") &&
      path === "/api/cattle"
    ) {
      const user = authenticateRequest(req);

      if (user instanceof Response) {
        return user;
      }

      // Fetch cattle
      if (req.method === "GET") {
        const permission = requireRoles(user, [
          "farmer",
          "veterinarian",
          "collection_centre",
          "authority",
        ]);

        if (permission) {
          return permission;
        }

        try {
          const cattle = await getCattle(user);

          return Response.json(cattle, {
            headers: corsHeaders,
          });
        } catch (error) {
          console.error("Failed to fetch cattle:", error);

          return Response.json(
            { error: "Failed to fetch cattle." },
            {
              status: 500,
              headers: corsHeaders,
            },
          );
        }
      }

      // Create cattle
      if (req.method === "POST") {
        const permission = requireRoles(user, ["farmer"]);

        if (permission) {
          return permission;
        }

        const response = await createCattle(req, user);

        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });

        return response;
      }
    }

    // ---------------- VETERINARIAN CATTLE ----------------

    if (path === "/api/vet/cattle" && req.method === "GET") {
      const user = authenticateRequest(req);

      if (user instanceof Response) {
        return user;
      }

      const permission = requireRoles(user, ["veterinarian"]);

      if (permission) {
        return permission;
      }

      try {
        const cattle = await getCattle(user);

        return Response.json(cattle, {
          headers: corsHeaders,
        });
      } catch (error) {
        console.error("Failed to fetch veterinarian cattle:", error);

        return Response.json(
          { error: "Failed to fetch cattle." },
          {
            status: 500,
            headers: corsHeaders,
          },
        );
      }
    }

    // ---------------- MEDICINE MRL REFERENCES ----------------

    if (path === "/api/mrl" && req.method === "GET") {
      const user = authenticateRequest(req);

      if (user instanceof Response) {
        return user;
      }

      const response = await handleMrlRequest(req, user);

      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // ---------------- VETERINARIAN TREATMENTS ----------------

    if (
      path === "/api/vet/treatments" &&
      (req.method === "GET" || req.method === "POST")
    ) {
      const user = authenticateRequest(req);

      if (user instanceof Response) {
        return user;
      }

      const permission = requireRoles(user, ["veterinarian"]);

      if (permission) {
        return permission;
      }

      const response = await handleTreatmentRequest(req, user);

      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

// ---------------- MILK BATCH RESIDUE SCREENING ----------------

const residueScreeningMatch = path.match(
  /^\/api\/milk-batches\/([^/]+)\/residue-screening$/,
);

if (residueScreeningMatch && req.method === "POST") {
  const user = authenticateRequest(req);

  if (user instanceof Response) {
    return user;
  }

  const permission = requireRoles(user, ["collection_centre"]);

  if (permission) {
    return permission;
  }

  // Check that the captured batch ID exists.
  const encodedMilkBatchId = residueScreeningMatch[1];

  if (!encodedMilkBatchId) {
    return Response.json(
      { error: "Invalid milk batch ID." },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  let milkBatchId: string;

  try {
    milkBatchId = decodeURIComponent(encodedMilkBatchId);
  } catch {
    return Response.json(
      { error: "Invalid milk batch ID." },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  const response = await handleResidueScreeningRequest(
    req,
    user,
    milkBatchId,
  );

  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

    // ---------------- MILK BATCHES ----------------

    if (
      path === "/api/milk-batches" &&
      (req.method === "GET" || req.method === "POST")
    ) {
      const user = authenticateRequest(req);

      if (user instanceof Response) {
        return user;
      }

      const permission = requireRoles(user, ["collection_centre"]);

      if (permission) {
        return permission;
      }

      const response = await handleMilkBatchRequest(req, user);

      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // ---------------- FACTORY ----------------

    if (path.startsWith("/api/factory/")) {
      const user = authenticateRequest(req);

      if (user instanceof Response) {
        return user;
      }

      const permission = requireRoles(user, ["factory"]);

      if (permission) {
        return permission;
      }

      const response = await handleFactoryRequest(req, user);

      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // ---------------- COLLECTION CENTRE FARMER & CATTLE ----------------

if (path.startsWith("/api/collection-centre/")) {
  const user = authenticateRequest(req);

  if (user instanceof Response) {
    return user;
  }

  const permission = requireRoles(user, ["collection_centre"]);

  if (permission) {
    return permission;
  }

  const response = await handleCollectionCentreFarmerRequest(req, user);

  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// ---------------- CONSUMER TRACEABILITY ----------------

const traceabilityMatch = path.match(
  /^\/api\/traceability\/([^/]+)$/,
);

if (traceabilityMatch) {
  const encodedBatchId = traceabilityMatch[1];

  if (!encodedBatchId) {
    return Response.json(
      { error: "Invalid batch ID." },
      { status: 400, headers: corsHeaders },
    );
  }

  let batchId: string;

  try {
    batchId = decodeURIComponent(encodedBatchId);
  } catch {
    return Response.json(
      { error: "Invalid batch ID." },
      { status: 400, headers: corsHeaders },
    );
  }

  const response = await handleTraceabilityRequest(req, batchId);

  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

    // ---------------- UNKNOWN ROUTE ----------------

    return Response.json(
      { error: "Route not found." },
      {
        status: 404,
        headers: corsHeaders,
      },
    );
  },
});

console.log(
  `🚀 ResiduGuard backend running at http://localhost:${server.port}`,
);
