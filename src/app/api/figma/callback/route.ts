/**
 * GET /api/figma/callback — Handle Figma OAuth callback
 * 
 * Validates the CSRF state, exchanges the authorization code for tokens,
 * encrypts and stores them in Supabase, then redirects to a success page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encryptToken } from '@/lib/cryptoUtils';
import { stateStore } from '../auth/route';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

const FIGMA_CLIENT_ID = (process.env.FIGMA_CLIENT_ID || '').trim();
const FIGMA_CLIENT_SECRET = (process.env.FIGMA_CLIENT_SECRET || '').trim();
const FIGMA_REDIRECT_URI = (process.env.FIGMA_REDIRECT_URI || '').trim();

export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');

    // Handle Figma denial
    if (error) {
        console.error('[Figma OAuth] User denied access:', error);
        return new NextResponse(renderResultPage(false, 'Authorization was denied.'), {
            headers: { 'Content-Type': 'text/html' },
        });
    }

    // Validate CSRF state
    if (!state || !stateStore.has(state)) {
        return new NextResponse(renderResultPage(false, 'Invalid or expired state. Please try again.'), {
            headers: { 'Content-Type': 'text/html' },
        });
    }

    const stateData = stateStore.get(state)!;
    stateStore.delete(state);

    if (Date.now() > stateData.expires) {
        return new NextResponse(renderResultPage(false, 'Authorization timed out. Please try again.'), {
            headers: { 'Content-Type': 'text/html' },
        });
    }

    if (!code) {
        return new NextResponse(renderResultPage(false, 'No authorization code received.'), {
            headers: { 'Content-Type': 'text/html' },
        });
    }

    const creatorEmail = stateData.email;

    try {
        // Exchange code for tokens
        const tokenRes = await fetch('https://api.figma.com/v1/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: FIGMA_CLIENT_ID,
                client_secret: FIGMA_CLIENT_SECRET,
                redirect_uri: FIGMA_REDIRECT_URI,
                code,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenRes.ok) {
            const errText = await tokenRes.text().catch(() => '');
            console.error('[Figma OAuth] Token exchange failed:', tokenRes.status, errText);
            return new NextResponse(renderResultPage(false, 'Token exchange failed. Please try again.'), {
                headers: { 'Content-Type': 'text/html' },
            });
        }

        const tokens = await tokenRes.json();
        // tokens: { access_token, refresh_token, expires_in, user_id }

        // Get Figma user info
        let figmaUserEmail = '';
        let figmaUserName = '';
        try {
            const userRes = await fetch('https://api.figma.com/v1/me', {
                headers: { 'Authorization': `Bearer ${tokens.access_token}` },
            });
            if (userRes.ok) {
                const user = await userRes.json();
                figmaUserEmail = user.email || '';
                figmaUserName = user.handle || '';
            }
        } catch (e) {
            console.warn('[Figma OAuth] Failed to fetch user info:', e);
        }

        // Encrypt tokens
        const encryptedAccess = encryptToken(tokens.access_token);
        const encryptedRefresh = encryptToken(tokens.refresh_token);

        // Upsert into Supabase
        const { error: dbError } = await supabase.from('figma_connections').upsert({
            creator_email: creatorEmail,
            figma_user_id: String(tokens.user_id || ''),
            figma_user_email: figmaUserEmail,
            figma_user_name: figmaUserName,
            access_token_encrypted: encryptedAccess,
            refresh_token_encrypted: encryptedRefresh,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'creator_email',
        });

        if (dbError) {
            console.error('[Figma OAuth] DB upsert error:', dbError);
            return new NextResponse(renderResultPage(false, 'Failed to save connection. Please try again.'), {
                headers: { 'Content-Type': 'text/html' },
            });
        }

        console.log(`[Figma OAuth] ✅ Connected: ${creatorEmail} → Figma user ${figmaUserName}`);

        return new NextResponse(renderResultPage(true, `Connected as ${figmaUserName || figmaUserEmail || 'Figma User'}`), {
            headers: { 'Content-Type': 'text/html' },
        });

    } catch (err) {
        console.error('[Figma OAuth] Unexpected error:', err);
        return new NextResponse(renderResultPage(false, 'An unexpected error occurred.'), {
            headers: { 'Content-Type': 'text/html' },
        });
    }
}

/**
 * Render a self-closing HTML page that communicates the result to the extension.
 * The page URL contains "figma-connected" for the extension to detect.
 */
function renderResultPage(success: boolean, message: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Preta × Figma ${success ? 'Connected' : 'Error'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh;
            background: ${success ? 'linear-gradient(135deg, #0F141A 0%, #1a2332 100%)' : '#1a1a1a'};
            color: #E6EAF2;
        }
        .card {
            text-align: center; padding: 48px;
            background: #1E2732; border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            max-width: 420px;
        }
        .icon { font-size: 64px; margin-bottom: 16px; }
        h1 { font-size: 24px; margin-bottom: 8px; color: ${success ? '#3FFB00' : '#FF4444'}; }
        p { font-size: 14px; color: #9AA4BF; line-height: 1.5; }
        .hint { margin-top: 16px; font-size: 12px; color: #6B7280; }
    </style>
</head>
<body>
    <!-- URL marker for chrome extension detection -->
    <div id="figma-connected" data-success="${success}" style="display:none"></div>
    <div class="card">
        <div class="icon">${success ? '✅' : '❌'}</div>
        <h1>${success ? 'Figma Connected!' : 'Connection Failed'}</h1>
        <p>${message}</p>
        <p class="hint">${success ? 'You can close this tab and return to the extension.' : 'Close this tab and try again from the extension.'}</p>
    </div>
    <script>
        // Auto-close after 3 seconds if successful
        ${success ? 'setTimeout(() => { window.close(); }, 3000);' : ''}
    </script>
</body>
</html>`;
}
