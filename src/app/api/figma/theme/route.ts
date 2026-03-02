/**
 * GET /api/figma/theme — Return stored Figma theme for extension
 * GET /api/figma/theme?email=...&domain=... — Get theme for specific domain
 * 
 * Also supports:
 * GET /api/figma/theme?email=...&list=true — List all themes for a creator
 * DELETE /api/figma/theme?email=... — Disconnect Figma (remove connection)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
    const email = request.nextUrl.searchParams.get('email');
    const domain = request.nextUrl.searchParams.get('domain');
    const list = request.nextUrl.searchParams.get('list');

    if (!email) {
        return NextResponse.json({ error: 'email parameter is required' }, {
            status: 400,
            headers: CORS_HEADERS,
        });
    }

    try {
        // 1. Check if Figma is connected for this user
        const { data: connectionData } = await supabase
            .from('figma_connections')
            .select('figma_user_name, figma_user_email')
            .eq('creator_email', email.toLowerCase())
            .single();

        const connection = connectionData ? {
            figmaUserName: connectionData.figma_user_name,
            figmaUserEmail: connectionData.figma_user_email,
            connected: true,
        } : { connected: false };

        // 2. Handle List mode
        if (list === 'true') {
            const { data: themes } = await supabase
                .from('figma_themes')
                .select('domain, figma_file_name, figma_file_key, extracted_at, updated_at')
                .eq('creator_email', email.toLowerCase())
                .order('updated_at', { ascending: false });

            return NextResponse.json({
                themes: themes || [],
                connection
            }, { headers: CORS_HEADERS });
        }

        // 3. Handle Single theme mode
        let query = supabase
            .from('figma_themes')
            .select('*')
            .eq('creator_email', email.toLowerCase());

        if (domain) {
            query = query.eq('domain', domain.toLowerCase());
        }

        const { data: themeData } = domain
            ? await query.single()
            : await query.order('updated_at', { ascending: false }).limit(1).single();

        // Even if no theme found, return 200 with connection status
        return NextResponse.json({
            success: !!themeData,
            theme: themeData?.site_theme || null,
            components: themeData?.components || [], // Include components
            metadata: themeData ? {
                domain: themeData.domain,
                figmaFileName: themeData.figma_file_name,
                figmaFileKey: themeData.figma_file_key,
                extractedAt: themeData.extracted_at,
                updatedAt: themeData.updated_at,
            } : null,
            connection
        }, { headers: CORS_HEADERS });

    } catch (err: any) {
        console.error('[Figma Theme] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to fetch theme' },
            { status: 500, headers: CORS_HEADERS }
        );
    }
}

/**
 * DELETE /api/figma/theme — Disconnect Figma and remove stored data
 */
export async function DELETE(request: NextRequest) {
    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
        return NextResponse.json({ error: 'email required' }, { status: 400, headers: CORS_HEADERS });
    }

    try {
        // Delete connection (tokens)
        await supabase
            .from('figma_connections')
            .delete()
            .eq('creator_email', email.toLowerCase());

        // Optionally delete cached themes
        await supabase
            .from('figma_themes')
            .delete()
            .eq('creator_email', email.toLowerCase());

        console.log(`[Figma Theme] Disconnected: ${email}`);

        return NextResponse.json({ success: true, message: 'Figma disconnected' }, { headers: CORS_HEADERS });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
    }
}
