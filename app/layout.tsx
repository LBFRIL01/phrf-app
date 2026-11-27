import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { isConfigured } from "@/lib/env";
import { getViewer } from "@/lib/auth";
import { hasRole } from "@/lib/labels";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

export const metadata: Metadata = {
  title: { default: "South Texas PHRF", template: "%s · South Texas PHRF" },
  description: "PHRF rating applications, boat records and committee review for South Texas PHRF.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "PHRF", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0b3c66", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { profile } = isConfigured ? await getViewer() : { profile: null };
  const role = profile?.role;
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="inner">
            <Link href="/" className="logo">South Texas PHRF</Link>
            <nav aria-label="Main">
              <Link href="/">Ratings</Link>
              <Link href="/apply">Apply</Link>
              {profile && <Link href="/my">My applications</Link>}
              {hasRole(role, "committee") && <Link href="/committee">Committee</Link>}
              {hasRole(role, "committee") && <Link href="/committee/boats">Boats</Link>}
              {hasRole(role, "admin") && <Link href="/admin">Admin</Link>}
              {profile ? (
                <form action="/auth/signout" method="post">
                  <button className="linkish" type="submit">Sign out</button>
                </form>
              ) : (
                <Link href="/login">Sign in</Link>
              )}
            </nav>
          </div>
        </header>
        <main>{isConfigured ? children : <SetupNeeded />}</main>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}

function SetupNeeded() {
  return (
    <div className="card">
      <h1>Almost there</h1>
      <p>
        The app is running but is not connected to its database yet. Add the two Supabase settings
        (<code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>) as described in
        the setup guide (<code>docs/SETUP.md</code>), then redeploy.
      </p>
    </div>
  );
}
