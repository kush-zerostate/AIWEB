/**
 * POST /api/figma/team-setup — Save the user's Figma team ID
 * 
 * Accepts a team URL or team ID, validates it by calling Figma's API,
 * and stores it in figma_connections for future auto-browsing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFigmaToken } from '@/lib/figmaAuth';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, teamId } = body;

        if (!email || !teamId) {
            return NextResponse.json(
                { error: 'email and teamId are required' },
                { status: 400, headers: CORS_HEADERS }
            );
        }

        // Verify the team ID works by calling Figma API
        const token = await getFigmaToken(email);
        const verifyRes = await fetch(
            `https://api.figma.com/v1/teams/${teamId}/projects`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!verifyRes.ok) {
            const errText = await verifyRes.text().catch(() => '');
            console.error(`[Team Setup] Verification failed: ${verifyRes.status} ${errText}`);
            return NextResponse.json(
                { error: 'Could not access this team. Make sure you are a member.' },
                { status: 400, headers: CORS_HEADERS }
            );
        }

        const projData = await verifyRes.json();
        const projectCount = (projData.projects || []).length;

        // Store team_id in figma_connections
        const { error: dbError } = await supabase
            .from('figma_connections')
            .update({ team_id: teamId })
            .eq('creator_email', email.toLowerCase());

        if (dbError) {
            console.error('[Team Setup] DB update error:', dbError);
            return NextResponse.json(
                { error: 'Failed to save team ID' },
                { status: 500, headers: CORS_HEADERS }
            );
        }

        console.log(`[Team Setup] ✅ Stored team ${teamId} for ${email} (${projectCount} projects)`);

        return NextResponse.json({
            success: true,
            teamId,
            projectCount,
        }, { headers: CORS_HEADERS });

    } catch (err: any) {
        console.error('[Team Setup] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Team setup failed' },
            { status: 500, headers: CORS_HEADERS }
        );
    }
}
