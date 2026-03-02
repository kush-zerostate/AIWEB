/**
 * Figma File JSON → SiteTheme Parser
 * 
 * Parses the JSON response from GET /v1/files/{key} and extracts
 * design tokens (colors, typography, effects, border radii) into
 * the SiteTheme format used by the AI generation engine.
 */

// ============ SiteTheme Interface (matches extension's themeExtractor.ts) ============


export interface SiteTheme {
    primaryColor: string;
    secondaryColor: string;
    surfaceColor: string;
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
    headingFontFamily: string;
    typography: {
        fontFamily: string;
        fontSize: string;
        fontWeight: string;
        lineHeight: string;
        letterSpacing: string;
        textTransform: string;
    };
    buttonStyles: {
        backgroundColor: string;
        textColor: string;
        borderRadius: string;
        border: string;
        padding: string;
        fontSize: string;
        fontWeight: string;
        fontFamily: string;
        boxShadow: string;
        transition: string;
    };
    borderRadius: string;
    boxShadow: string;
    transition: string;
    isDarkMode: boolean;
}

export interface FigmaComponentBlueprint {
    id: string;
    name: string;
    type: 'button' | 'modal' | 'banner' | 'badge' | 'float';
    style: any;
    text?: string;
    thumbnail?: string;
}

export interface FigmaParserResult {
    theme: SiteTheme;
    components: FigmaComponentBlueprint[];
}

// ============ Color Utilities ============

function figmaRGBToHex(c: { r: number; g: number; b: number }): string {
    const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

function hexBrightness(hex: string): number {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return 128;
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
}

function getContrastingText(hex: string): string {
    return hexBrightness(hex) < 128 ? '#FFFFFF' : '#000000';
}

function effectToCSS(e: any): string {
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        const prefix = e.type === 'INNER_SHADOW' ? 'inset ' : '';
        const { r, g, b, a } = e.color || { r: 0, g: 0, b: 0, a: 0.15 };
        const ox = e.offset?.x || 0;
        const oy = e.offset?.y || 0;
        const radius = e.radius || 0;
        const spread = e.spread || 0;
        return `${prefix}${ox}px ${oy}px ${radius}px ${spread}px rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${(a ?? 0.15).toFixed(2)})`;
    }
    return '';
}

// ============ Pattern Matching ============

const ROLE_PATTERNS: Record<string, RegExp> = {
    primary: /primary|brand|accent|main|cta|action/i,
    secondary: /secondary|alt|complement|highlight/i,
    surface: /surface|card|panel|container|modal/i,
    background: /background|bg|base|canvas|page/i,
    text: /text|body|content|foreground|dark/i,
};

const COMPONENT_PATTERNS: Record<string, RegExp> = {
    button: /button|cta|btn|action/i,
    modal: /modal|dialog|popup|overlay/i,
    banner: /banner|alert|nudge|strip/i,
    badge: /badge|tag|label|pill/i,
    float: /float|fab|floating|bubble/i,
};

// ============ Main Parser ============

export function parseFigmaFileToSiteTheme(fileData: any): FigmaParserResult {
    const styles = fileData.styles || {};
    const colorMap = new Map<string, string>(); // styleName → hex
    const textMap = new Map<string, any>();      // styleName → text props
    const variablesMap = new Map<string, any>(); // variableId → value
    const shadows: string[] = [];
    const radii: number[] = [];
    const discoveredComponents: FigmaComponentBlueprint[] = [];

    // ---- Index Variables if present ----
    if (fileData.variables) {
        for (const [id, variable] of Object.entries(fileData.variables) as any) {
            if (variable.resolvedValuesByMode) {
                const firstModeId = Object.keys(variable.resolvedValuesByMode)[0];
                const value = variable.resolvedValuesByMode[firstModeId];
                if (variable.type === 'COLOR' && value) {
                    variablesMap.set(id, figmaRGBToHex(value));
                } else if (variable.type === 'FLOAT') {
                    variablesMap.set(id, value);
                }
            }
        }
    }

    // Walk the document tree to collect values
    function walk(node: any) {
        if (!node) return;

        // ---- Collect colors from styled fills ----
        if (node.fills?.[0]?.type === 'SOLID' && node.fills[0].color) {
            const hex = figmaRGBToHex(node.fills[0].color);
            const styleName = node.styles?.fill ? (styles[node.styles.fill]?.name || '') : '';

            if (styleName) {
                colorMap.set(styleName, hex);
            } else if (node.name) {
                colorMap.set(`__node__${node.name}__${hex}`, hex);
            }
        }

        // Check for variables on fills
        if (node.fills?.[0]?.boundVariables?.color) {
            const varId = node.fills[0].boundVariables.color.id;
            if (variablesMap.has(varId)) {
                const hex = variablesMap.get(varId);
                colorMap.set(`variable__${varId}`, hex);
            }
        }

        // ---- Collect text styles ----
        if (node.type === 'TEXT' && node.style) {
            const styleName = node.styles?.text
                ? styles[node.styles.text]?.name || node.name
                : node.name;
            if (styleName) {
                textMap.set(styleName, node.style);
            }
        }

        // ---- Collect effects ----
        if (Array.isArray(node.effects)) {
            for (const effect of node.effects) {
                if ((effect.type === 'DROP_SHADOW') && effect.visible !== false) {
                    shadows.push(effectToCSS(effect));
                }
            }
        }

        // ---- Collect border radii ----
        if (typeof node.cornerRadius === 'number') {
            radii.push(node.cornerRadius);
        }

        // ---- Discover Components ----
        if (node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'FRAME') {
            for (const [type, pattern] of Object.entries(COMPONENT_PATTERNS)) {
                if (pattern.test(node.name)) {
                    const blueprint = mapNodeToBlueprint(node, type as any);
                    if (blueprint && discoveredComponents.length < 12) {
                        discoveredComponents.push(blueprint);
                    }
                    break;
                }
            }
        }

        // Recurse children
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                walk(child);
            }
        }
    }

    function mapNodeToBlueprint(node: any, type: FigmaComponentBlueprint['type']): FigmaComponentBlueprint | null {
        try {
            const bgFill = node.fills?.find((f: any) => f.type === 'SOLID' && f.visible !== false);
            const textChild = findTextContent(node);

            const style: any = {
                backgroundColor: bgFill ? figmaRGBToHex(bgFill.color) : 'transparent',
                borderRadius: node.cornerRadius ? `${node.cornerRadius}px` : '0px',
                padding: `${node.paddingTop || 0}px ${node.paddingRight || 0}px ${node.paddingBottom || 0}px ${node.paddingLeft || 0}px`,
                boxShadow: node.effects?.find((e: any) => e.type === 'DROP_SHADOW') ? effectToCSS(node.effects.find((e: any) => e.type === 'DROP_SHADOW')) : 'none',
            };

            if (textChild) {
                style.textColor = textChild.fills?.[0]?.color ? figmaRGBToHex(textChild.fills[0].color) : '#000000';
                style.fontSize = `${textChild.style?.fontSize || 14}px`;
                style.fontWeight = String(textChild.style?.fontWeight || 400);
                style.fontFamily = textChild.style?.fontFamily || 'inherit';
            }

            return {
                id: node.id,
                name: node.name,
                type,
                style,
                text: textChild?.characters || node.name,
            };
        } catch (e) {
            console.warn(`[Figma Parser] Failed to map node ${node.id} to blueprint:`, e);
            return null;
        }
    }

    function findTextContent(node: any): any {
        if (node.type === 'TEXT') return node;
        if (node.children) {
            for (const child of node.children) {
                const found = findTextContent(child);
                if (found) return found;
            }
        }
        return null;
    }

    walk(fileData.document);

    // ---- Clean up discoveries (unique names) ----
    const uniqueDiscoveries = Array.from(new Map(discoveredComponents.map(c => [c.name, c])).values());

    // ---- Smart color matching (existing theme logic) ----
    function findColor(role: string): string | null {
        const pattern = ROLE_PATTERNS[role];
        if (!pattern) return null;

        if (fileData.variables) {
            for (const [id, variable] of Object.entries(fileData.variables) as any) {
                if (pattern.test(variable.name)) {
                    const hex = variablesMap.get(id);
                    if (hex) return hex;
                }
            }
        }

        let firstMatch: string | null = null;
        for (const [name, hex] of colorMap) {
            if (name.startsWith('__node__') || name.startsWith('variable__')) continue;
            if (pattern.test(name)) {
                if (/500|default/i.test(name)) return hex;
                if (!firstMatch) firstMatch = hex;
            }
        }

        const frequency: Record<string, number> = {};
        for (const hex of colorMap.values()) {
            frequency[hex] = (frequency[hex] || 0) + 1;
        }
        const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]);

        if (role === 'primary' && !firstMatch) {
            for (const [hex] of sorted) {
                if (hexBrightness(hex) > 230 || hexBrightness(hex) < 25) continue;
                return hex;
            }
            if (sorted.length > 0) return sorted[0][0];
        }

        if (role === 'background' && !firstMatch) {
            for (const [hex] of sorted) {
                const b = hexBrightness(hex);
                if (b > 240 || b < 30) return hex;
            }
            for (const hex of colorMap.values()) {
                const b = hexBrightness(hex);
                if (b > 245 || b < 20) return hex;
            }
        }

        return firstMatch;
    }

    function findTextStyle(pattern: RegExp): any | null {
        for (const [name, style] of textMap) {
            if (pattern.test(name)) return style;
        }
        return null;
    }

    const bodyStyle = findTextStyle(/body|regular|paragraph|base|default/i)
        || Array.from(textMap.values())[0];
    const headingStyle = findTextStyle(/heading|h1|h2|display|title/i);
    const buttonStyle = findTextStyle(/button|cta|label|action/i);

    const primaryColor = findColor('primary') || '#3B82F6';
    const backgroundColor = findColor('background') || '#FFFFFF';
    const borderRadius = radii.length > 0
        ? `${Math.round(radii.reduce((a, b) => a + b) / radii.length)}px`
        : '8px';

    const theme: SiteTheme = {
        primaryColor,
        secondaryColor: findColor('secondary') || primaryColor,
        surfaceColor: findColor('surface') || backgroundColor,
        backgroundColor,
        textColor: findColor('text') || '#1a1a1a',
        fontFamily: bodyStyle?.fontFamily || 'Inter, sans-serif',
        headingFontFamily: headingStyle?.fontFamily || bodyStyle?.fontFamily || 'Inter, sans-serif',
        typography: {
            fontFamily: bodyStyle?.fontFamily || 'Inter',
            fontSize: bodyStyle?.fontSize ? `${bodyStyle.fontSize}px` : '16px',
            fontWeight: bodyStyle?.fontWeight ? String(bodyStyle.fontWeight) : '400',
            lineHeight: bodyStyle?.lineHeightPx ? `${bodyStyle.lineHeightPx}px` : '1.5',
            letterSpacing: bodyStyle?.letterSpacing ? `${bodyStyle.letterSpacing}px` : 'normal',
            textTransform: bodyStyle?.textCase === 'UPPER' ? 'uppercase' : 'none',
        },
        buttonStyles: {
            backgroundColor: primaryColor,
            textColor: getContrastingText(primaryColor),
            borderRadius,
            border: 'none',
            padding: '12px 24px',
            fontSize: buttonStyle?.fontSize ? `${buttonStyle.fontSize}px` : '14px',
            fontWeight: buttonStyle?.fontWeight ? String(buttonStyle.fontWeight) : '600',
            fontFamily: buttonStyle?.fontFamily || bodyStyle?.fontFamily || 'Inter',
            boxShadow: 'none',
            transition: 'all 0.2s ease',
        },
        borderRadius,
        boxShadow: shadows[0] || 'none',
        transition: 'all 0.2s ease',
        isDarkMode: hexBrightness(backgroundColor) < 128,
    };

    return {
        theme,
        components: uniqueDiscoveries,
    };
}
