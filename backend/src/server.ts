
import { getCattle, createCattle } from "./routes/cattle";
import { login, register } from "./routes/auth";
import { handleFactoryRequest } from "./routes/factory";
import { handleMilkBatchRequest } from "./routes/milk-batches";
import {
  authenticateRequest,
  requireRoles,
} from "./lib/auth-middleware";

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

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Public authentication endpoints.
    if (req.method === "POST" && path === "/api/auth/register") {
      const response = await register(req);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    if (req.method === "POST" && path === "/api/auth/login") {
      const response = await login(req);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // All cattle endpoints below require a valid JWT.
    if (
      (req.method === "GET" || req.method === "POST") &&
      path === "/api/cattle"
    ) {
      const user = authenticateRequest(req);

      if (user instanceof Response) {
        return user;
      }

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
            { status: 500, headers: corsHeaders },
          );
        }
      }

      if (req.method === "POST") {
        const permission = requireRoles(user, ["farmer"]);

        if (permission) {
          return permission;
        }

        return createCattle(req, user);
      }
    }

    if (
      path === "/api/milk-batches" &&
      (req.method === "GET" || req.method === "POST")
    ) {
      const user = authenticateRequest(req);
      if (user instanceof Response) return user;

      const permission = requireRoles(user, ["collection_centre"]);
      if (permission) return permission;

      const response = await handleMilkBatchRequest(req, user);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    if (path.startsWith("/api/factory/")) {
      const user = authenticateRequest(req);
      if (user instanceof Response) return user;

      const permission = requireRoles(user, ["factory"]);
      if (permission) return permission;

      const response = await handleFactoryRequest(req, user);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    return Response.json(
      { error: "Route not found." },
      { status: 404, headers: corsHeaders },
    );
  },
});

console.log(
  `🚀 ResiduGuard backend running at http://localhost:${server.port}`,
);
