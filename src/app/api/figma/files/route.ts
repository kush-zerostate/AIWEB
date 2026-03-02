/**
 * GET /api/figma/files — List a creator's Figma files
 *
 * Auto-detects team from stored figma_connections.team_id.
 * Also supports explicit: ?teamId=... or ?projectId=...
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
    const email = request.nextUrl.searchParams.get('email');
    let teamId = request.nextUrl.searchParams.get('teamId');
    const projectId = request.nextUrl.searchParams.get('projectId');

    if (!email) {
        return NextResponse.json({ error: 'email parameter is required' }, {
            status: 400, headers: CORS_HEADERS,
        });
    }

    try {
        const token = await getFigmaToken(email);
        const files: any[] = [];

        // --- Auto-detect team ID from database if not provided ---
        if (!teamId && !projectId) {
            const { data: connection } = await supabase
                .from('figma_connections')
                .select('team_id')
                .eq('creator_email', email.toLowerCase())
                .single();

            if (connection?.team_id) {
                teamId = connection.team_id;
                console.log(`[Figma Files] Auto-detected team ${teamId} from DB`);
            }
        }

        // --- Mode 1: Specific project ---
        if (projectId) {
            console.log(`[Figma Files] Fetching files for project ${projectId}`);
            const filesRes = await fetch(
                `https://api.figma.com/v1/projects/${projectId}/files`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (filesRes.ok) {
                const data = await filesRes.json();
                for (const file of data.files || []) {
                    files.push({
                        key: file.key,
                        name: file.name,
                        thumbnail_url: file.thumbnail_url || '',
                        last_modified: file.last_modified,
                        project_name: 'Project',
                        team_name: '',
                    });
                }
            }
        }
        // --- Mode 2: Team ID → projects → files ---
        else if (teamId) {
            console.log(`[Figma Files] Fetching projects for team ${teamId}`);
            const projRes = await fetch(
                `https://api.figma.com/v1/teams/${teamId}/projects`,
                
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (projRes.ok) {
                const projData = await projRes.json();
                for (const project of (projData.projects || []).slice(0, 20)) {
                    try {
                        const filesRes = await fetch(
                            `https://api.figma.com/v1/projects/${project.id}/files`,
                            { headers: { 'Authorization': `Bearer ${token}` } }
                        );
                        if (!filesRes.ok) continue;
                        const filesData = await filesRes.json();
                        for (const file of filesData.files || []) {
                            files.push({
                                key: file.key,
                                name: file.name,
                                thumbnail_url: file.thumbnail_url || '',
                                last_modified: file.last_modified,
                                project_name: project.name,
                                team_name: '',
                            });
                        }
                    } catch { continue; }
                }
            } else {
                console.warn(`[Figma Files] Team fetch failed: ${projRes.status}`);
            }
        }
        // --- Mode 3: No team ID available ---
        else {
            console.log(`[Figma Files] No team configured for ${email}`);
        }

        files.sort((a, b) =>
            new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime()
        );

        console.log(`[Figma Files] Found ${files.length} files for ${email}`);

        return NextResponse.json({
            files: files.slice(0, 50),
            needsTeamSetup: !teamId && !projectId,
        }, { headers: CORS_HEADERS });

    } catch (err: any) {
        console.error('[Figma Files] Error:', err);

        if (err.message === 'FIGMA_REAUTH_REQUIRED') {
            return NextResponse.json(
                { error: 'figma_reauth_required', message: 'Figma session expired. Please reconnect.' },
                { status: 401, headers: CORS_HEADERS }
            );
        }

        return NextResponse.json(
            { error: err.message || 'Failed to list files' },
            { status: 500, headers: CORS_HEADERS }
        );
    }
}
