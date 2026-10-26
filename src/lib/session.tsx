
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { RoleId } from "@/lib/roles";

const API_URL = (import.meta.env["VITE_API_URL"] || "http://localhost:3000").replace(/\/$/, "");
const SESSION_KEY = "residuguard.session";
const validRoles: RoleId[] = [
  "farmer",
  "veterinarian",
  "collection_centre",
  "factory",
  "authority",
  "consumer",
];

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: RoleId;
};

type StoredSession = {
  user: AuthUser;
  token: string;
};

type AuthResponse = {
  message?: string;
  error?: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
  token?: string;
};

type SessionContextValue = {
  user: AuthUser | null;
  token: string | null;
  role: RoleId | null;
  hydrated: boolean;
  register: (
    fullName: string,
    email: string,
    password: string,
    role: RoleId,
    profile: Record<string, string>,
  ) => Promise<void>;
  signIn: (
    email: string,
    password: string,
    role: RoleId,
  ) => Promise<AuthUser>;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;

  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return null;

    const parsed: unknown = JSON.parse(saved);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("user" in parsed) ||
      !("token" in parsed) ||
      typeof parsed.token !== "string" ||
      !parsed.token ||
      typeof parsed.user !== "object" ||
      parsed.user === null
    ) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    const user = parsed.user as AuthUser;
    if (
      typeof user.id !== "string" ||
      typeof user.fullName !== "string" ||
      typeof user.email !== "string" ||
      !validRoles.includes(user.role)
    ) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return { user, token: parsed.token };
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

async function postAuth(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<AuthResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      "Cannot connect to the server. Make sure the ResiduGuard backend is running.",
    );
  }

  const result = (await response.json()) as AuthResponse;

  if (!response.ok) {
    throw new Error(result.error || "Authentication request failed.");
  }

  return result;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [initialSession] = useState<StoredSession | null>(() =>
    readStoredSession(),
  );
  const [user, setUser] = useState<AuthUser | null>(
    () => initialSession?.user ?? null,
  );
  const [token, setToken] = useState<string | null>(
    () => initialSession?.token ?? null,
  );
  const role = user?.role ?? null;

  async function register(
    fullName: string,
    email: string,
    password: string,
    role: RoleId,
    profile: Record<string, string>,
  ): Promise<void> {
    // Registration does not automatically sign in the user.
    await postAuth("register", {
      fullName,
      email,
      password,
      role,
      ...profile,
    });
  }

  async function signIn(
    email: string,
    password: string,
    role: RoleId,
  ): Promise<AuthUser> {
    const result = await postAuth("login", {
      email,
      password,
      role,
    });

    if (!result.user) {
      throw new Error("The server did not return user information.");
    }

    if (!result.token) {
      throw new Error(
        "The server did not return an authentication token. Check the backend login response.",
      );
    }

    if (!validRoles.includes(result.user.role as RoleId)) {
      throw new Error("The server returned an unsupported user role.");
    }

    const authenticatedUser = result.user as AuthUser;
    const newSession: StoredSession = {
      user: authenticatedUser,
      token: result.token,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    setUser(authenticatedUser);
    setToken(result.token);

    return authenticatedUser;
  }

  function signOut() {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setToken(null);
  }

  return (
    <SessionContext.Provider
      value={{ user, token, role, hydrated: true, register, signIn, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within a SessionProvider.");
  }

  return context;
}
