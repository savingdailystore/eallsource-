'use server';

import { signOut } from '@/lib/auth';

// Server-side sign-out. NextAuth v5's server action reliably clears the
// session cookie and redirects, unlike the client signOut() in the beta.
export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}
