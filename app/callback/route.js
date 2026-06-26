import { NextResponse } from 'next/server';

/**
 * GET /callback
 * Spotify OAuth callback route.
 * Handles the Spotify API callback when hitting http://127.0.0.1:3000/callback.
 * Logs callback requests to the console for verification and redirects to the home page.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get('error');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  // Print log to server console to verify it is called by Spotify API
  console.log(`\n[Spotify Callback] Incoming Request:`);
  console.log(`  - URL: ${request.url}`);
  console.log(`  - Success: ${!error}`);
  if (code) console.log(`  - Authorization Code: ${code}`);
  if (state) console.log(`  - State Parameter: ${state}`);
  if (error) console.error(`  - Error: ${error}\n`);

  if (error) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#000;color:#1DB954;padding:40px">
        <h2>VOUXIFY Auth Callback</h2>
        <p style="color:#ff3333">Error from Spotify: ${error}</p>
        <a href="/" style="color:#1DB954;text-decoration:none;font-weight:bold;">← Back to VOUXIFY Home</a>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Redirect back to home page
  return NextResponse.redirect(new URL('/', request.url));
}
