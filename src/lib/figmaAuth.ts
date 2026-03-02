/**
 * Figma token management with auto-refresh.
 * Retrieves stored tokens from Supabase, decrypts them,
 * and automatically refreshes expired access tokens.
 */

import { createClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from './cryptoUtils';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

/**
 * Get a valid Figma access token for a creator.
 * Auto-refreshes if the token is expired or about to expire.
 */
export async function getFigmaToken(creatorEmail: string): Promise<string> {
    const { data, error } = await supabase
        .from('figma_connections')
        .select('*')
        .eq('creator_email', creatorEmail.toLowerCase())
        .single();

    if (error || !data) {
        throw new Error('No Figma connection found. Please connect your Figma account first.');
    }

    const expiresAt = new Date(data.token_expires_at).getTime();

    // If token expires within 5 minutes, refresh it
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
        console.log('[Figma Auth] Token expired or expiring soon, refreshing...');
        return await refreshFigmaToken(creatorEmail, data.refresh_token_encrypted);
    }

    return decryptToken(data.access_token_encrypted);
}

/**
 * Refresh a Figma access token using the stored refresh token.
 */
async function refreshFigmaToken(email: string, encryptedRefresh: string): Promise<string> {
    const refreshToken = decryptToken(encryptedRefresh);

    const res = await fetch('https://api.figma.com/v1/oauth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.FIGMA_CLIENT_ID || '',
            client_secret: process.env.FIGMA_CLIENT_SECRET || '',
            refresh_token: refreshToken,
        }),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[Figma Auth] Token refresh failed:', errText);
        throw new Error('FIGMA_REAUTH_REQUIRED');
    }

    const tokens = await res.json();

    // Update stored tokens
    const { error } = await supabase
        .from('figma_connections')
        .update({
            access_token_encrypted: encryptToken(tokens.access_token),
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('creator_email', email.toLowerCase());

    if (error) {
        console.error('[Figma Auth] Failed to update refreshed token:', error);
    }

    console.log('[Figma Auth] Token refreshed successfully');
    return tokens.access_token;
}

/**
 * Check if a creator has a Figma connection.
 */
export async function hasFigmaConnection(creatorEmail: string): Promise<boolean> {
    const { data } = await supabase
        .from('figma_connections')
        .select('id')
        .eq('creator_email', creatorEmail.toLowerCase())
        .single();

    return !!data;
}

/**
 * Delete a creator's Figma connection.
 */
export async function deleteFigmaConnection(creatorEmail: string): Promise<void> {
    await supabase
        .from('figma_connections')
        .delete()
        .eq('creator_email', creatorEmail.toLowerCase());
}
