import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ScanLine } from "lucide-react";
import heroImage from "@/assets/dairy-farm-hero.png";
import logo from "@/assets/residuguard-logo.png";
import "@/styles/landing.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ResiduGuard — Antibiotic Treatment & Milk Traceability Platform" },
      {
        name: "description",
        content:
          "Track cattle treatment, monitor withdrawal periods, manage milk batches, and provide transparent farm-to-consumer traceability.",
      },
      { property: "og:title", content: "ResiduGuard — Antibiotic Treatment & Milk Traceability" },
      {
        property: "og:description",
        content:
          "A dairy-chain portal for treatment records, withdrawal compliance, milk batch management and consumer traceability.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="rg">
      <a
        href="/"
        className="rg-logo"
        aria-label="ResiduGuard – reload page"
        onClick={(e) => {
          e.preventDefault();
          window.location.reload();
        }}
        >
        <img src={logo} alt="ResiduGuard" width={1254} height={1254} />
      </a>

      <figure className="rg-photo">
        <img
          src={heroImage}
          alt="Indian dairy farmer and veterinarian with Gir cattle beside milk cans at a cooperative farm"
          width={1580}
          height={995}
        />
      </figure>

      <div className="rg-copy">
        <h1>ResiduGuard</h1>
        <p className="rg-tagline">
          From Cow to Consumer.
          <br />
          Every Drop Deserves Trust.
        </p>
        <p className="rg-sub">Antibiotic Treatment &amp; Milk Traceability Platform</p>
        <div className="rg-actions">
          <Link to="/login" className="rg-btn rg-btn--solid">
            Login
            <span className="rg-btn__icon" aria-hidden>
              <ArrowUpRight size={18} />
            </span>
          </Link>
          <Link to="/verify" className="rg-btn rg-btn--ghost">
            Verify Batch
            <span className="rg-btn__icon" aria-hidden>
              <ScanLine size={18} />
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}