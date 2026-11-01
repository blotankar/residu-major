
import { prisma } from "../lib/prisma";
import { UserRole } from "../../generated/prisma/client";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

const roleMap: Record<string, UserRole> = {
  farmer: UserRole.FARMER,
  veterinarian: UserRole.VETERINARIAN,
  collection_centre: UserRole.COLLECTION_CENTRE,
  factory: UserRole.FACTORY,
  authority: UserRole.AUTHORITY,
  consumer: UserRole.CONSUMER,
};

const reverseRoleMap: Record<UserRole, string> = {
  [UserRole.FARMER]: "farmer",
  [UserRole.VETERINARIAN]: "veterinarian",
  [UserRole.COLLECTION_CENTRE]: "collection_centre",
  [UserRole.FACTORY]: "factory",
  [UserRole.AUTHORITY]: "authority",
  [UserRole.CONSUMER]: "consumer",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function normalizeRole(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Creates a signed JWT for an authenticated user.
 * The token contains the user ID and role, but no password or private data.
 */
function createToken(userId: string, role: UserRole): string {
  return jwt.sign(
    {
      sub: userId,
      role: reverseRoleMap[role],
    },
    JWT_SECRET!,
    {
      expiresIn: "8h",
      issuer: "residuguard-api",
      audience: "residuguard-frontend",
    },
  );
}

export async function register(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    const fullName = normalizeString(body.fullName);
    const email = normalizeString(body.email).toLowerCase();
    const password =
      typeof body.password === "string" ? body.password : "";
    const roleKey = normalizeRole(body.role);
    const role = roleMap[roleKey];

    if (!fullName || !email || !password || !roleKey) {
      return json(
        { error: "Name, email, password, and role are required." },
        400,
      );
    }

    if (!isValidEmail(email)) {
      return json(
        { error: "Please enter a valid email address." },
        400,
      );
    }

    if (password.length < 8) {
      return json(
        { error: "Password must contain at least 8 characters." },
        400,
      );
    }

    if (!role) {
      return json({ error: "Invalid role selected." }, 400);
    }

    // Authority accounts must be provisioned by an administrator.
    if (role === UserRole.AUTHORITY) {
      return json(
        {
          error:
            "Authority accounts are created by an administrator. Please contact your administrator.",
        },
        403,
      );
    }

    // Consumers use guest batch verification.
    if (role === UserRole.CONSUMER) {
      return json(
        {
          error:
            "Consumer accounts are not required. Please use batch verification.",
        },
        403,
      );
    }

    const phone = normalizeString(body.phone) || null;

    // Role-specific profile information.
    let village = "";
    let farmName = "";
    let farmLocation = "";
    let licenseNo = "";
    let centreCode = "";
    let centreVillage = "";
    let centreAddress = "";
    let factoryCode = "";
    let factoryAddress = "";

    // Validate role-specific information before writing to the database.
    switch (role) {
      case UserRole.FARMER:
        village = normalizeString(body.village);
        farmName = normalizeString(body.farmName);
        farmLocation = normalizeString(body.farmLocation);

        if (!village || !farmName || !farmLocation) {
          return json(
            {
              error:
                "Village, farm name, and farm location are required for farmers.",
            },
            400,
          );
        }
        break;

      case UserRole.VETERINARIAN:
        licenseNo = normalizeString(body.licenseNo);

        if (!licenseNo) {
          return json(
            { error: "Veterinarian license number is required." },
            400,
          );
        }
        break;

      case UserRole.COLLECTION_CENTRE:
        centreCode = normalizeString(body.code);
        centreVillage = normalizeString(body.village);
        centreAddress = normalizeString(body.address);

        if (!centreCode) {
          return json(
            { error: "Collection centre code is required." },
            400,
          );
        }
        break;

      case UserRole.FACTORY:
        factoryCode = normalizeString(body.code);
        factoryAddress = normalizeString(body.address);

        if (!factoryCode) {
          return json(
            { error: "Factory code is required." },
            400,
          );
        }
        break;

      default:
        return json(
          { error: "This role cannot register publicly." },
          403,
        );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return json(
        { error: "An account with this email already exists." },
        409,
      );
    }

    const passwordHash = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 12,
    });

    // Create the user and profile in a single database transaction.
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: fullName,
          email,
          passwordHash,
          role,
        },
      });

      switch (role) {
        case UserRole.FARMER:
          await tx.farmer.create({
            data: {
              userId: createdUser.id,
              village,
              phone,
              farmName,
              farmLocation,
            },
          });
          break;

        case UserRole.VETERINARIAN:
          await tx.veterinarian.create({
            data: {
              userId: createdUser.id,
              name: fullName,
              licenseNo,
              phone,
            },
          });
          break;

        case UserRole.COLLECTION_CENTRE:
          await tx.collectionCentre.create({
            data: {
              userId: createdUser.id,
              name: fullName,
              code: centreCode,
              village: centreVillage || null,
              address: centreAddress || null,
            },
          });
          break;

        case UserRole.FACTORY:
          await tx.factory.create({
            data: {
              userId: createdUser.id,
              name: fullName,
              code: factoryCode,
              address: factoryAddress || null,
            },
          });
          break;
      }

      return createdUser;
    });

    const token = createToken(user.id, user.role);

    return json(
      {
        message: "Registration successful.",
        user: {
          id: user.id,
          fullName: user.name,
          email: user.email,
          role: reverseRoleMap[user.role],
        },
        token,
      },
      201,
    );
  } catch (error: any) {
    console.error("Registration error:", error);

    if (error?.code === "P2002") {
      return json(
        {
          error:
            "This email, license number, or organization code is already registered.",
        },
        409,
      );
    }

    return json(
      { error: "Registration failed. Please try again." },
      500,
    );
  }
}

export async function login(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    const email = normalizeString(body.email).toLowerCase();
    const password =
      typeof body.password === "string" ? body.password : "";
    const roleKey = normalizeRole(body.role);
    const selectedRole = roleMap[roleKey];

    if (!email || !password || !roleKey) {
      return json(
        { error: "Email, password, and selected role are required." },
        400,
      );
    }

    if (!selectedRole) {
      return json(
        { error: "Invalid role selected." },
        400,
      );
    }

    if (selectedRole === UserRole.CONSUMER) {
      return json(
        {
          error:
            "Consumers do not need to log in. Please use batch verification.",
        },
        403,
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Use the same response for unknown email and incorrect password.
    if (!user) {
      return json(
        { error: "Invalid email or password." },
        401,
      );
    }

    const passwordMatches = await Bun.password.verify(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      return json(
        { error: "Invalid email or password." },
        401,
      );
    }

    // The selected role must match the user's actual database role.
    if (user.role !== selectedRole) {
      return json(
        {
          error: `This account is registered as ${reverseRoleMap[user.role]}. Please select the correct role.`,
        },
        403,
      );
    }

    // Issue a token only after credentials and role are verified.
    const token = createToken(user.id, user.role);

    return json({
      message: "Login successful.",
      user: {
        id: user.id,
        fullName: user.name,
        email: user.email,
        role: reverseRoleMap[user.role],
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);

    return json(
      { error: "Login failed. Please try again." },
      500,
    );
  }
}
