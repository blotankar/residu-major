import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/session";
import type { RoleId } from "@/lib/roles";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

const publicRoles: RoleId[] = [
  "farmer" as RoleId,
  "veterinarian" as RoleId,
  "collection_centre" as RoleId,
  "factory" as RoleId,
];

const roleLabels: Record<string, string> = {
  farmer: "Farmer",
  veterinarian: "Veterinarian",
  collection_centre: "Collection Centre",
  factory: "Factory",
};

function getSelectedRole(): RoleId | null {
  if (typeof window === "undefined") return null;

  const role = new URLSearchParams(window.location.search).get("role");

  if (!role || !publicRoles.includes(role as RoleId)) {
    return null;
  }

  return role as RoleId;
}

function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useSession();

  // Role comes from the Login page; it cannot be selected here.
  const [selectedRole] = useState<RoleId | null>(() => getSelectedRole());

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [village, setVillage] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [organizationCode, setOrganizationCode] = useState("");
  const [address, setAddress] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  if (!selectedRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Select a role first</h1>
          <p className="mt-3 text-sm text-slate-600">
            Please return to the Login page and select Farmer, Veterinarian, Collection Centre, or
            Factory before registering.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            className="mt-6 w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800"
          >
            Back to Login
          </button>
        </section>
      </main>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedRole) {
      setError("Select a registration role before continuing.");
      return;
    }

    if (!fullName.trim() || !email.trim() || !password) {
      setError("Please complete all required fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Build the profile payload for the selected role only.
    const profile: Record<string, string> = {};

    if (selectedRole === ("farmer" as RoleId)) {
      if (!village.trim()) {
        setError("Please enter your village.");
        return;
      }

      profile["village"] = village.trim();
      profile["phone"] = phone.trim();
    }

    if (selectedRole === ("veterinarian" as RoleId)) {
      if (!licenseNo.trim()) {
        setError("Please enter your veterinarian license number.");
        return;
      }

      profile["licenseNo"] = licenseNo.trim();
      profile["phone"] = phone.trim();
    }

    if (selectedRole === ("collection_centre" as RoleId)) {
      if (!organizationCode.trim()) {
        setError("Please enter your collection centre code.");
        return;
      }

      profile["code"] = organizationCode.trim();
      profile["village"] = village.trim();
      profile["address"] = address.trim();
    }

    if (selectedRole === ("factory" as RoleId)) {
      if (!organizationCode.trim()) {
        setError("Please enter your factory code.");
        return;
      }

      profile["code"] = organizationCode.trim();
      profile["address"] = address.trim();
    }

    setLoading(true);

    try {
      await register(fullName.trim(), email.trim(), password, selectedRole, profile);

      setSuccess("Registration successful! Redirecting to Login...");

      window.setTimeout(() => {
        navigate({ to: "/login" });
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const roleLabel = roleLabels[String(selectedRole)] ?? "User";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
            ResiduGuard
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-2 text-sm text-slate-600">
            Registering as <span className="font-semibold text-emerald-800">{roleLabel}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-slate-700">
              Full name *
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Enter your full name"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email address *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {/* Farmer-specific fields */}
          {selectedRole === ("farmer" as RoleId) && (
            <>
              <div>
                <label htmlFor="village" className="mb-1 block text-sm font-medium text-slate-700">
                  Village *
                </label>
                <input
                  id="village"
                  name="village"
                  required
                  value={village}
                  onChange={(event) => setVillage(event.target.value)}
                  placeholder="Enter your village"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-700">
                  Phone number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Enter phone number"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </>
          )}

          {/* Veterinarian-specific fields */}
          {selectedRole === ("veterinarian" as RoleId) && (
            <>
              <div>
                <label
                  htmlFor="licenseNo"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Veterinary license number *
                </label>
                <input
                  id="licenseNo"
                  name="licenseNo"
                  required
                  value={licenseNo}
                  onChange={(event) => setLicenseNo(event.target.value)}
                  placeholder="Enter license number"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-700">
                  Phone number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Enter phone number"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </>
          )}

          {/* Collection Centre-specific fields */}
          {selectedRole === ("collection_centre" as RoleId) && (
            <>
              <div>
                <label
                  htmlFor="organizationCode"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Collection Centre Code *
                </label>
                <input
                  id="organizationCode"
                  name="organizationCode"
                  required
                  value={organizationCode}
                  onChange={(event) => setOrganizationCode(event.target.value)}
                  placeholder="Enter centre code"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor="village" className="mb-1 block text-sm font-medium text-slate-700">
                  Village
                </label>
                <input
                  id="village"
                  name="village"
                  value={village}
                  onChange={(event) => setVillage(event.target.value)}
                  placeholder="Enter village"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor="address" className="mb-1 block text-sm font-medium text-slate-700">
                  Address
                </label>
                <input
                  id="address"
                  name="address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Enter centre address"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </>
          )}

          {/* Factory-specific fields */}
          {selectedRole === ("factory" as RoleId) && (
            <>
              <div>
                <label
                  htmlFor="organizationCode"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Factory Code *
                </label>
                <input
                  id="organizationCode"
                  name="organizationCode"
                  required
                  value={organizationCode}
                  onChange={(event) => setOrganizationCode(event.target.value)}
                  placeholder="Enter factory code"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor="address" className="mb-1 block text-sm font-medium text-slate-700">
                  Address
                </label>
                <input
                  id="address"
                  name="address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Enter factory address"
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password *
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Confirm password *
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your password"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || Boolean(success)}
            className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="font-semibold text-emerald-700 hover:underline"
            >
              Sign in
            </button>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          ResiduGuard · Milk safety and residue traceability
        </p>
      </section>
    </main>
  );
}
