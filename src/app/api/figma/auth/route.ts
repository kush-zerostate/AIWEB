/**
 * GET /api/figma/auth — Initiate Figma OAuth 2.0
 * 
 * Generates a CSRF state token, stores it temporarily,
 * and redirects the user to Figma's authorization page.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const FIGMA_CLIENT_ID = (process.env.FIGMA_CLIENT_ID || '').trim();
const FIGMA_REDIRECT_URI = (process.env.FIGMA_REDIRECT_URI || '').trim();

// Persist stateStore across hot reloads in development
const globalForFigma = globalThis as unknown as {
    figmaStateStore: Map<string, { email: string; expires: number }> | undefined;
};

const stateStore = globalForFigma.figmaStateStore ?? new Map<string, { email: string; expires: number }>();

if (process.env.NODE_ENV !== 'production') {
    globalForFigma.figmaStateStore = stateStore;
}

// Cleanup expired states every 10 minutes
// Only start one timer
if (!(globalForFigma as any).figmaCleanupStarted) {
    (globalForFigma as any).figmaCleanupStarted = true;
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of stateStore) {
            if (now > value.expires) stateStore.delete(key);
        }
    }, 10 * 60 * 1000);
}

// Export for use by callback route
export { stateStore };

export async function GET(request: NextRequest) {
    const email = request.nextUrl.searchParams.get('email');

    // Verbose logging for debugging the "App doesn't exist" issue
    console.log(`[Figma OAuth] Request received for: ${email}`);
    console.log(`[Figma OAuth] Using Client ID: "${FIGMA_CLIENT_ID}" (length: ${FIGMA_CLIENT_ID.length})`);
    console.log(`[Figma OAuth] Using Redirect URI: "${FIGMA_REDIRECT_URI}"`);

    if (!email) {
        return NextResponse.json({ error: 'email parameter is required' }, { status: 400 });
    }

    if (!FIGMA_CLIENT_ID || !FIGMA_REDIRECT_URI) {
        return NextResponse.json(
            { error: 'Figma OAuth not configured. Set FIGMA_CLIENT_ID and FIGMA_REDIRECT_URI.' },
            { status: 500 }
        );
    }

    // Generate a cryptographic state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    stateStore.set(state, {
        email: email.toLowerCase(),
        expires: Date.now() + 10 * 60 * 1000, // 10 minute TTL
    });

    // Build Figma authorization URL
    const authUrl = new URL('https://www.figma.com/oauth');
    authUrl.searchParams.set('client_id', FIGMA_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', FIGMA_REDIRECT_URI);
    authUrl.searchParams.set('scope', 'current_user:read file_content:read file_metadata:read projects:read');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');

    console.log(`[Figma OAuth] Initiating auth for ${email}, state=${state.substring(0, 8)}...`);

    return NextResponse.redirect(authUrl.toString());
}
