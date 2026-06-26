import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/callback
 * Spotify OAuth callback redirect (if ever needed).
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const error = searchParams.get('error');
  const code = searchParams.get('code');

  if (error) {
    return NextResponse.redirect(new URL('/?auth_error=' + encodeURIComponent(error), req.url));
  }

  // VOUXIFY uses Client Credentials, no user OAuth needed
  return NextResponse.redirect(new URL('/', req.url));
}
