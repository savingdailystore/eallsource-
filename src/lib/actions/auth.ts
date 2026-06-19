'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { signOut } from '@/lib/auth';

// Server-side sign-out. In NextAuth v5 beta, signOut({ redirectTo }) doesn't
// always clear the session cookie on Vercel (the __Secure- / chunked variants
// get left behind), so the redirect to /login bounces straight back to the
// dashboard because middleware still sees a valid token — the button looks
// like it does nothing. We clear the cookie via signOut, then belt-and-
// suspenders strip every auth cookie ourselves before redirecting.
export async function signOutAction() {
  await signOut({ redirect: false });

  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.includes('authjs') || c.name.includes('next-auth')) {
      store.delete(c.name);
    }
  }

  redirect('/login');
}
