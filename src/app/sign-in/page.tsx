import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DemoAccountCards } from "@/components/auth/sign-in-options";
import { LogoMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";
import { signInWithGoogle } from "@/server/actions/auth";
import { DEMO_USERS } from "@/server/auth/demo-users";
import { getCurrentUser } from "@/server/auth/session";
import { isDemoMode, isGoogleAuthEnabled } from "@/server/env";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That email is already linked to another sign-in method.",
  AccessDenied: "Access was denied.",
  Configuration: "Sign-in isn't configured correctly on this server.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const demoMode = isDemoMode();
  const google = isGoogleAuthEnabled();
  const cards = DEMO_USERS.filter((u) => u.id !== "demo-sam").map(({ id, name, role, pitch }) => ({
    id,
    name,
    role,
    pitch,
  }));
  const errorText = typeof error === "string" ? (ERRORS[error] ?? "Sign-in didn't work. Please try again.") : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="flex flex-col items-center text-center">
          <LogoMark className="size-12" />
          <h1 className="mt-5 text-[32px] leading-tight font-extrabold tracking-[-0.03em]">Welcome to {APP_NAME}</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            Search the catalog, borrow and return books, and ask the librarian anything.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-surface p-5 sm:p-6">
          {errorText && (
            <p role="alert" className="mb-4 rounded-xl bg-destructive-bg px-3 py-2 text-sm text-destructive">
              {errorText}
            </p>
          )}
          {google ? (
            <form action={signInWithGoogle}>
              <Button type="submit" variant="outline" size="lg" className="w-full">
                <GoogleIcon />
                Continue with Google
              </Button>
            </form>
          ) : (
            !demoMode && (
              <p className="text-sm text-ink-2">
                No sign-in method is configured. Set <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code>,
                or turn on <code>DEMO_MODE</code>.
              </p>
            )
          )}

          {demoMode && (
            <>
              {google && (
                <div className="my-5 flex items-center gap-3 text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">
                  <span className="h-px flex-1 bg-border" />
                  or try a demo account
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              {!google && <p className="mb-3 text-sm font-semibold text-ink-2">Try a demo account</p>}
              <DemoAccountCards accounts={cards} />
              <p className="mt-4 text-center text-[13px] text-ink-3">
                Demo accounts share one sandbox that resets every night. Switch roles any time from the sidebar.
              </p>
            </>
          )}
        </div>
        {google && (
          <p className="mt-4 text-center text-[13px] text-ink-3">New Google sign-ins join as members.</p>
        )}
      </div>
    </main>
  );
}
