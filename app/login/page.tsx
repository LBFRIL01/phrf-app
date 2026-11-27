import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/my";
  return (
    <div style={{ maxWidth: 460 }}>
      <h1>Sign in</h1>
      <p className="muted">
        No password needed. Enter your email and we will send you a 6-digit code (and a link). First time here? This
        creates your account.
      </p>
      {sp.error && <p className="notice error">{sp.error}</p>}
      <LoginForm next={next} />
    </div>
  );
}
