import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ============ Image Cropping ============

/**
 * Crops the center horizontal strip from a (likely square) AI-generated image
 * to produce a true wide banner (24:1 aspect ratio).
 * Takes the middle ~4.2% of the image height (1/24th) at full width.
 */
async function cropToBanner(base64Data: string): Promise<string> {
    try {
        const inputBuffer = Buffer.from(base64Data, 'base64');
        const metadata = await sharp(inputBuffer).metadata();
        const width = metadata.width || 1024;
        const height = metadata.height || 1024;

        // Calculate the strip: full width, center 1/4th of height (matching 4:1 ratio)
        const stripHeight = Math.max(Math.round(height / 4), 1);
        const top = Math.round((height - stripHeight) / 2);

        const croppedBuffer = await sharp(inputBuffer)
            .extract({ left: 0, top, width, height: stripHeight })
            .png()
            .toBuffer();

        return croppedBuffer.toString('base64');
    } catch (err) {
        console.warn('[generate] Image crop failed, returning original:', err);
        return base64Data; // fallback: return uncropped
    }
}
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_IMAGE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

// ============ Types ============

interface SiteTheme {
    primaryColor: string;
    secondaryColor: string;
    surfaceColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
    headingFontFamily: string;
    borderRadius: string;
    isDarkMode: boolean;
}

const FALLBACK_THEME: SiteTheme = {
    primaryColor: '#3B82F6',
    secondaryColor: '#6366F1',
    surfaceColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    textColor: '#1a1a1a',
    fontFamily: 'Inter, sans-serif',
    headingFontFamily: 'Inter, sans-serif',
    borderRadius: '8px',
    isDarkMode: false,
};

// ============ Prompt Builders ============

function buildThemeSummary(theme: SiteTheme): string {
    return [
        `Primary color: ${theme.primaryColor}`,
        `Secondary color: ${theme.secondaryColor}`,
        `Background: ${theme.backgroundColor}`,
        `Surface/card: ${theme.surfaceColor}`,
        `Text color: ${theme.textColor}`,
        `Font: ${theme.fontFamily}`,
        `Heading font: ${theme.headingFontFamily}`,
        `Button radius: ${theme.borderRadius}`,
        `Dark mode: ${theme.isDarkMode ? 'yes' : 'no'}`,
    ].join('\n');
}

function buildSystemPrompt(theme: SiteTheme): string {
    return `You are a UI design AI. You generate web UI components that PERFECTLY match a website's existing visual identity.

WEBSITE THEME (extracted from the actual page — you MUST use these EXACT values):
${buildThemeSummary(theme)}

CRITICAL RULES:
1. You MUST use the EXACT primary color "${theme.primaryColor}" as the main background for buttons and CTAs.
2. You MUST use the EXACT text color "${theme.textColor}" for body text.
3. For the "bgColor" field of modals, banners, and badges, you MUST use EXACTLY "${theme.backgroundColor}" or "${theme.surfaceColor}". Do NOT invent your own background color. Do NOT use black or dark colors if the site is light mode.${!theme.isDarkMode ? '\n   ⚠️ WARNING: This site is LIGHT MODE. The bgColor MUST be a light color like "' + theme.backgroundColor + '". NEVER output a dark bgColor like #000000, #1a1a1a, #111, #222, etc.' : ''}
4. You MUST use the EXACT font family "${theme.fontFamily}" for text content.
5. Use "${theme.borderRadius}" for border radius values.
6. If the site is ${theme.isDarkMode ? 'dark mode — use dark backgrounds and light text' : 'light mode — use light backgrounds and dark text'}.
7. All color values must be valid CSS hex codes.
8. Keep copy concise and action-oriented.
9. You MUST generate EXACTLY 3 variant components so the user has options to choose from.
10. Respond with ONLY valid JSON — no markdown, no backticks, no explanation outside the JSON.

RESPONSE FORMAT (strict JSON):
{
  "components": [
    // Array of EXACTLY 3 variant objects. Each object has a "type" field.
    // type "button":  { type, text, bgColor, textColor, borderRadius, href }
    // type "modal":   { type, headline, description, buttonText, buttonLink, bgColor, textColor, buttonColor }
    // type "banner":  { type, bannerText, buttonText, buttonLink, bgColor, textColor, buttonColor, position }
    // type "badge":   { type, text, bgColor, textColor, shape }
    // type "float":   { type, text, bgColor, textColor, borderRadius, icon }
  ],
  "reasoning": "One sentence about your design choices"
}`;
}

// ============ POST /api/generate ============

export async function POST(request: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'Gemini API key is not configured.' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { prompt, componentType, theme: themeData, mode } = body;

        if (!prompt || typeof prompt !== 'string') {
            return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
        }

        const theme: SiteTheme = themeData || FALLBACK_THEME;

        // ---- Image Banner Mode ----
        if (mode === 'image-banner') {
            const styleVariations = [
                'photographic product showcase style',
                'modern gradient and abstract design style',
                'clean minimalist flat design style',
            ];

            const basePrompt = `Create a professional, high-quality WEBSITE BANNER IMAGE.
The banner MUST be a very wide, thin horizontal strip — exactly like a website promotional banner bar (1200×300 pixels, 4:1 aspect ratio). 

COMPOSITION REQUIREMENTS (FULL-BLEED CINEMATIC):
1. **ULTRA-THIN SAFE STRIP**: All logos, text, and primary subjects MUST be placed in a very thin horizontal strip in the DEAD CENTER vertically (middle 5% of the total image height).
2. **EDGE-TO-EDGE BACKGROUND**: The background design, colors, and textures MUST fill the entire square from edge to edge. 
3. This ensures that when we crop the image to an ultra-wide website banner (10:1 ratio), the background stays visible but the text is never cut off.
4. The 5% safe strip is CRITICAL — any important detail outside this middle 5% will be lost.

STYLE REQUIREMENTS:
- QUALITY: HI-RES, 8K, EXTREMELY DETAILED, and SHARP FOCUS.
- VISUALS: Professional marketing aesthetics, no blurry edges.
- Use a color palette based on: ${theme.primaryColor}, ${theme.secondaryColor}, ${theme.backgroundColor}
- ${theme.isDarkMode ? 'Dark, moody aesthetic' : 'Clean, bright aesthetic'}
- MUST be extremely wide and short (PANORAMIC horizontal strip, NOT a square or tall image)
- Focus subject matter in the center 50% of the horizontal width
- Can include product imagery, patterns, or gradients
- No placeholder text — the image should be purely visual

USER REQUEST: ${prompt}`;

            const promises = styleVariations.map(async (style) => {
                try {
                    const variantPrompt = `${basePrompt}\n- Use a ${style}`;
                    const apiBody = {
                        contents: [{ parts: [{ text: variantPrompt }] }],
                        generationConfig: {
                            maxOutputTokens: 8192
                        },
                    };

                    const response = await fetch(`${GEMINI_IMAGE_URL}?key=${GEMINI_API_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(apiBody),
                    });

                    if (!response.ok) return null;

                    const data = await response.json();
                    const parts = data?.candidates?.[0]?.content?.parts || [];

                    let imageBase64 = '';
                    let reasoning = '';

                    for (const part of parts) {
                        if (part.inlineData) imageBase64 = part.inlineData.data;
                        if (part.text) reasoning = part.text;
                    }

                    if (!imageBase64) return null;

                    // Crop the square image to a slim center-strip banner
                    const croppedBase64 = await cropToBanner(imageBase64);
                    return { imageBase64: croppedBase64, mimeType: 'image/png', reasoning };
                } catch {
                    return null;
                }
            });

            const results = (await Promise.all(promises)).filter(r => r !== null);

            if (results.length === 0) {
                return NextResponse.json({ error: 'No images were generated. Try a different prompt.' }, { status: 500 });
            }

            return NextResponse.json({ images: results });
        }

        // ---- Text Component Mode ----
        const userPrompt = componentType
            ? `Generate exactly 3 variants of a ${componentType} component: ${prompt}`
            : `Generate exactly 3 variants: ${prompt}`;

        const apiBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${buildSystemPrompt(theme)}\n\nUSER REQUEST:\n${userPrompt}` }],
                },
            ],
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 4096,
            },
        };

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiBody),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            return NextResponse.json({ error: `Gemini API error (${response.status}): ${errText}` }, { status: 500 });
        }

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];

        // Find the part with JSON
        let rawText = '';
        for (let i = parts.length - 1; i >= 0; i--) {
            const t = parts[i]?.text || '';
            if (t.includes('"components"')) { rawText = t; break; }
        }
        if (!rawText) {
            for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i]?.text) { rawText = parts[i].text; break; }
            }
        }

        // Parse JSON
        let jsonStr = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*"components"[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];

        try {
            const parsed = JSON.parse(jsonStr);
            if (!Array.isArray(parsed.components)) throw new Error('Invalid structure');

            // Enforce theme bgColor on components — fix AI ignoring background color
            for (const comp of parsed.components) {
                if (comp.bgColor && comp.type !== 'button' && comp.type !== 'float') {
                    const bgHex = comp.bgColor.replace('#', '').toLowerCase();
                    const themeBgHex = theme.backgroundColor.replace('#', '').toLowerCase();
                    // Calculate brightness: if theme is light but AI returned dark (or vice versa), fix it
                    const bgBrightness = parseInt(bgHex.substring(0, 2), 16) * 0.299 +
                        parseInt(bgHex.substring(2, 4), 16) * 0.587 +
                        parseInt(bgHex.substring(4, 6), 16) * 0.114;
                    const themeBgBrightness = parseInt(themeBgHex.substring(0, 2), 16) * 0.299 +
                        parseInt(themeBgHex.substring(2, 4), 16) * 0.587 +
                        parseInt(themeBgHex.substring(4, 6), 16) * 0.114;
                    // If theme is light (>128) but component bg is dark (<128), override it
                    const themeIsLight = themeBgBrightness > 128;
                    const compIsDark = bgBrightness < 128;
                    if (themeIsLight && compIsDark) {
                        comp.bgColor = theme.backgroundColor;
                    } else if (!themeIsLight && !compIsDark) {
                        comp.bgColor = theme.backgroundColor;
                    }
                }
            }

            return NextResponse.json(parsed);
        } catch {
            // Recovery attempt
            let recoverable = jsonStr;
            if (recoverable.includes('"components"')) {
                const lastBrace = recoverable.lastIndexOf('}');
                if (lastBrace > 0) {
                    recoverable = recoverable.substring(0, lastBrace + 1);
                    if (!recoverable.trimEnd().endsWith(']}')) recoverable += ']}';
                    if (!recoverable.trimEnd().endsWith('}')) recoverable += '}';
                }
                try {
                    const fallback = JSON.parse(recoverable);
                    if (Array.isArray(fallback.components)) {
                        fallback.reasoning = fallback.reasoning || '';
                        return NextResponse.json(fallback);
                    }
                } catch { /* give up */ }
            }
            return NextResponse.json({ error: 'Failed to parse AI response. Please try a different prompt.' }, { status: 500 });
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
