/**
 * GET/POST /api/figma/extract-theme — Fetch a Figma file and extract its theme
 * 
 * Takes a file key, fetches the full file JSON from Figma REST API,
 * parses it into a SiteTheme, and stores the result in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFigmaToken } from '@/lib/figmaAuth';
import { parseFigmaFileToSiteTheme } from '@/lib/figmaFileParser';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: CORS_HEADERS });
}

async function handleExtraction(request: NextRequest) {
    let email: string | null = null;
    let fileKey: string | null = null;
    let domain: string | null = null;

    // Handle both GET and POST
    if (request.method === 'POST') {
        try {
            const body = await request.json();
            email = body.email;
            fileKey = body.fileKey;
            domain = body.domain;
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
        }
    } else {
        const searchParams = request.nextUrl.searchParams;
        email = searchParams.get('email');
        fileKey = searchParams.get('fileKey');
        domain = searchParams.get('domain');
    }

    if (!email || !fileKey) {
        return NextResponse.json(
            { error: 'email and fileKey are required' },
            { status: 400, headers: CORS_HEADERS }
        );
    }

    try {
        const token = await getFigmaToken(email);

        console.log(`[Figma Extract] Fetching file ${fileKey} for ${email}...`);

        // Fetch the Figma file JSON (Deep Scan: depth=20 with geometry=none for better detection)
        const fileRes = await fetch(
            `https://api.figma.com/v1/files/${fileKey}?depth=20&geometry=none`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!fileRes.ok) {
            const errText = await fileRes.text().catch(() => '');
            console.error(`[Figma Extract] API error ${fileRes.status}:`, errText);

            if (fileRes.status === 429) {
                const retryAfter = fileRes.headers.get('Retry-After');
                const waitTime = retryAfter ? `${retryAfter} seconds` : 'a few minutes';
                return NextResponse.json(
                    { error: `Figma's servers are overloaded by your file size. Please wait ${waitTime} and try again.` },
                    { status: 429, headers: CORS_HEADERS }
                );
            }

            if (fileRes.status === 404) {
                return NextResponse.json(
                    { error: 'File not found. Check the file key or ensure you have access.' },
                    { status: 404, headers: CORS_HEADERS }
                );
            }

            throw new Error(`Figma API error: ${fileRes.status}`);
        }

        const fileData = await fileRes.json();

        // Parse into SiteTheme and Discover Components
        const { theme, components } = parseFigmaFileToSiteTheme(fileData);

        // Store in Supabase
        const themeDomain = (domain || fileData.name || 'untitled').toLowerCase();

        const { error: dbError } = await supabase.from('figma_themes').upsert({
            creator_email: email.toLowerCase(),
            domain: themeDomain,
            figma_file_name: fileData.name || '',
            figma_file_key: fileKey,
            site_theme: theme,
            components: components, // Save components here
            extracted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'creator_email,domain',
        });

        if (dbError) {
            console.error('[Figma Extract] DB error:', dbError);
        }

        console.log(`[Figma Extract] ✅ Theme extracted & ${components.length} components discovered for "${fileData.name}"`);

        return NextResponse.json({
            success: true,
            theme,
            components, // Return discovered components
            metadata: {
                fileName: fileData.name,
                fileKey,
                domain: themeDomain,
                extractedAt: new Date().toISOString(),
            },
        }, { headers: CORS_HEADERS });

    } catch (err: any) {
        console.error('[Figma Extract] Error:', err);

        if (err.message === 'FIGMA_REAUTH_REQUIRED') {
            return NextResponse.json(
                { error: 'figma_reauth_required' },
                { status: 401, headers: CORS_HEADERS }
            );
        }

        return NextResponse.json(
            { error: err.message || 'Failed to extract theme' },
            { status: 500, headers: CORS_HEADERS }
        );
    }
}

export async function GET(request: NextRequest) {
    return handleExtraction(request);
}

export async function POST(request: NextRequest) {
    return handleExtraction(request);
}
