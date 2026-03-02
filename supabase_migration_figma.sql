-- ============================================================
-- Figma Integration — Supabase Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Table for OAuth connections (stores encrypted tokens)
CREATE TABLE IF NOT EXISTS figma_connections (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    creator_email           TEXT NOT NULL UNIQUE,
    figma_user_id           TEXT,
    figma_user_email        TEXT,
    figma_user_name         TEXT,
    access_token_encrypted  TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_expires_at        TIMESTAMPTZ NOT NULL,
    connected_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Add team_id column if it doesn't exist (for auto-browsing files)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'figma_connections' AND column_name = 'team_id'
    ) THEN
        ALTER TABLE figma_connections ADD COLUMN team_id TEXT;
    END IF;
END $$;

-- 2. Table for extracted themes
CREATE TABLE IF NOT EXISTS figma_themes (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    creator_email   TEXT NOT NULL,
    domain          TEXT NOT NULL,
    figma_file_name TEXT,
    figma_file_key  TEXT,
    site_theme      JSONB NOT NULL,
    components      JSONB DEFAULT '[]'::jsonb,
    extracted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(creator_email, domain)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_figma_themes_email ON figma_themes(creator_email);
CREATE INDEX IF NOT EXISTS idx_figma_themes_domain ON figma_themes(domain);
CREATE INDEX IF NOT EXISTS idx_figma_connections_email ON figma_connections(creator_email);

-- 4. RLS (both tables use service_role key, so RLS blocks public access)
ALTER TABLE figma_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE figma_themes ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
DROP POLICY IF EXISTS "Service role full access on figma_connections" ON figma_connections;
CREATE POLICY "Service role full access on figma_connections"
    ON figma_connections FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on figma_themes" ON figma_themes;
CREATE POLICY "Service role full access on figma_themes"
    ON figma_themes FOR ALL
    USING (true)
    WITH CHECK (true);
