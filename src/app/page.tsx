'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

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
  [key: string]: unknown;
}

type ComponentType = 'button' | 'modal' | 'banner' | 'badge' | 'float' | 'image-banner';

interface GeneratedButton {
  type: 'button';
  text: string;
  bgColor: string;
  textColor: string;
  borderRadius: string;
  href: string;
}

interface GeneratedModal {
  type: 'modal';
  headline: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  bgColor: string;
  textColor: string;
  buttonColor: string;
}

interface GeneratedBanner {
  type: 'banner';
  bannerText: string;
  buttonText: string;
  buttonLink: string;
  bgColor: string;
  textColor: string;
  buttonColor: string;
  position: 'top' | 'bottom';
}

interface GeneratedBadge {
  type: 'badge';
  text: string;
  bgColor: string;
  textColor: string;
  shape: 'round' | 'pill' | 'square' | 'rectangle';
}

interface GeneratedFloat {
  type: 'float';
  text: string;
  bgColor: string;
  textColor: string;
  borderRadius: string;
  icon: string;
}

type GeneratedComponent = GeneratedButton | GeneratedModal | GeneratedBanner | GeneratedBadge | GeneratedFloat;

interface ImageResult {
  imageBase64: string;
  mimeType: string;
  reasoning: string;
}

// ============ Constants ============

const COMPONENT_TYPES: { key: ComponentType; label: string; emoji: string }[] = [
  { key: 'button', label: 'Button', emoji: '🔘' },
  { key: 'modal', label: 'Modal', emoji: '📦' },
  { key: 'banner', label: 'Banner', emoji: '📢' },
  { key: 'badge', label: 'Badge', emoji: '🏷️' },
  { key: 'float', label: 'FAB', emoji: '⚡' },
  { key: 'image-banner', label: 'Image Banner', emoji: '🖼️' },
];

const QUICK_PROMPTS = [
  'Create a newsletter signup modal',
  'Create a "Limited Time" sale badge',
  'Create a CTA button for free trial',
  'Create a promotional banner',
  'Create a floating action button for support',
];

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

// ============ Main Page (wrapped in Suspense) ============

export default function Home() {
  return (
    <Suspense fallback={<div className="app-layout"><div className="loading-container"><div className="loading-spinner" /><div className="loading-text">Loading...</div></div></div>}>
      <AIGenerationPage />
    </Suspense>
  );
}

function AIGenerationPage() {
  const searchParams = useSearchParams();

  // Decode theme from URL
  const [theme, setTheme] = useState<SiteTheme>(FALLBACK_THEME);
  const [prompt, setPrompt] = useState('');
  const [selectedType, setSelectedType] = useState<ComponentType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [components, setComponents] = useState<GeneratedComponent[]>([]);
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [reasoning, setReasoning] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);

  // ---- Figma State ----
  const [themeSource, setThemeSource] = useState<'live' | 'figma'>('live');
  const [figmaConnected, setFigmaConnected] = useState(false);
  const [figmaConnection, setFigmaConnection] = useState<any>(null);
  const [figmaFiles, setFigmaFiles] = useState<any[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [figmaLoading, setFigmaLoading] = useState(false);
  const [figmaError, setFigmaError] = useState<string | null>(null);
  const [discoveredComponents, setDiscoveredComponents] = useState<any[]>([]);

  const [currentUserEmail, setCurrentUserEmail] = useState('user@example.com');

  useEffect(() => {
    // Resolve the actual user email - passed by extension via URL, stored in localStorage
    const resolveEmail = () => {
      // Priority 1: Connected account email (if already loaded)
      if (figmaConnection?.[0]?.creator_email) return figmaConnection[0].creator_email;

      // Priority 2: URL parameter
      const fromUrl = searchParams.get('email');
      if (fromUrl) {
        if (typeof window !== 'undefined') localStorage.setItem('preta_user_email', fromUrl);
        return fromUrl;
      }
      // Priority 3: LocalStorage
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('preta_user_email');
        if (stored) return stored;
      }
      return 'user@example.com';
    };

    setCurrentUserEmail(resolveEmail());
  }, [figmaConnection, searchParams]);

  useEffect(() => {
    const themeParam = searchParams.get('theme');
    if (themeParam) {
      try {
        const decoded = JSON.parse(atob(themeParam));
        setTheme(decoded);
      } catch {
        console.warn('Failed to decode theme from URL, using fallback');
      }
    }

    // Check Figma Status
    checkFigmaStatus(currentUserEmail);
  }, [searchParams]);

  const checkFigmaStatus = async (userEmail?: string) => {
    if (!userEmail) return;
    try {
      const res = await fetch(`/api/figma/theme?email=${userEmail}`);
      if (res.ok) {
        const data = await res.json();
        if (data.connection?.connected) {
          setFigmaConnected(true);
          setFigmaConnection(data.connection);
          if (data.theme) {
            // If user previously selected a figma theme, use it
            const savedSource = localStorage.getItem('preta_theme_source');
            if (savedSource === 'figma') {
              setThemeSource('figma');
              setTheme(data.theme);
              setDiscoveredComponents(data.components || []);
            }
          }
        } else {
          setFigmaConnected(false);
          setFigmaConnection(null);
        }
      }
    } catch { /* silent */ }
  };

  const handleSourceChange = (src: 'live' | 'figma') => {
    setThemeSource(src);
    localStorage.setItem('preta_theme_source', src);
    if (src === 'figma' && figmaConnection?.theme) {
      setTheme(figmaConnection.theme);
    } else if (src === 'live') {
      // Restore live theme from URL
      const themeParam = searchParams.get('theme');
      if (themeParam) {
        try {
          const decoded = JSON.parse(atob(themeParam));
          setTheme(decoded);
        } catch { setTheme(FALLBACK_THEME); }
      } else {
        setTheme(FALLBACK_THEME);
      }
    }
  };

  const handleConnectFigma = () => {
    const width = 600, height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open('/api/figma/auth?email=user@example.com', 'figma-auth', `width=${width},height=${height},left=${left},top=${top}`);

    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        checkFigmaStatus(currentUserEmail);
      }
    }, 1000);
  };

  const handleShowFilePicker = async () => {
    setShowFilePicker(true);
    setFigmaLoading(true);
    setFigmaError(null);
    try {
      const res = await fetch(`/api/figma/files?email=${currentUserEmail}`);
      if (!res.ok) throw new Error('Failed to load files');
      const data = await res.json();
      setFigmaFiles(data.files || []);
      if (data.needsTeamSetup && data.files.length === 0) {
        setFigmaError('NEEDS_TEAM_SETUP');
      }
    } catch (err: any) {
      setFigmaError(err.message);
    } finally {
      setFigmaLoading(false);
    }
  };

  const handleTeamSetup = async (url: string) => {
    const teamMatch = url.match(/\/team\/(\d+)/);
    const projectMatch = url.match(/\/project\/(\d+)/);
    const fileMatch = url.match(/\/(file|design|proto)\/([a-zA-Z0-9]+)/);

    if (fileMatch) {
      // Direct file URL - just extract theme
      handleSelectFile(fileMatch[2]);
      return;
    }

    if (!teamMatch) {
      setFigmaError('Could not find a Team ID in the URL. Copy the URL from Figma when viewing your Team page.');
      return;
    }

    setFigmaLoading(true);
    setFigmaError(null);
    try {
      // Save team ID
      const setupRes = await fetch('/api/figma/team-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUserEmail, teamId: teamMatch[1] }),
      });

      if (!setupRes.ok) {
        const err = await setupRes.json();
        throw new Error(err.error || 'Team setup failed');
      }

      // Now fetch files
      const filesRes = await fetch(`/api/figma/files?email=${currentUserEmail}`);
      const filesData = await filesRes.json();
      setFigmaFiles(filesData.files || []);
      setFigmaError(null);
    } catch (err: any) {
      setFigmaError(err.message);
    } finally {
      setFigmaLoading(false);
    }
  };

  const handleSelectFile = async (fileKey: string) => {
    setFigmaLoading(true);
    setFigmaError(null);
    setShowFilePicker(false);
    try {
      const res = await fetch(`/api/figma/extract-theme?fileKey=${fileKey}&domain=${window.location.hostname}&email=${currentUserEmail}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract theme');
      }

      setTheme(data.theme);
      setThemeSource('figma');
      setDiscoveredComponents(data.components || []);
      setFigmaConnection((prev: any) => ({ ...prev, theme: data.theme, meta: data.meta }));
      localStorage.setItem('preta_theme_source', 'figma');
    } catch (err: any) {
      setFigmaError(err.message);
    } finally {
      setFigmaLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch(`/api/figma/theme?email=${currentUserEmail}`, { method: 'DELETE' });
      setFigmaConnected(false);
      setFigmaConnection(null);
      setFigmaFiles([]);
      setDiscoveredComponents([]);
      setThemeSource('live');
      setTheme(FALLBACK_THEME);
      localStorage.removeItem('preta_theme_source');
    } catch { /* silent */ }
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setComponents([]);
    setImageResults([]);
    setReasoning('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          componentType: selectedType === 'image-banner' ? undefined : selectedType,
          theme,
          mode: selectedType === 'image-banner' ? 'image-banner' : 'text',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Generation failed.');
        return;
      }

      if (data.images) {
        setImageResults(data.images);
      } else if (data.components) {
        setComponents(data.components);
        setReasoning(data.reasoning || '');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, selectedType, theme]);

  const handleApply = useCallback((component: GeneratedComponent, index: number) => {
    try {
      if (window.opener) {
        window.opener.postMessage({ source: 'preta-aiweb', type: 'apply-component', payload: component }, '*');
      }
      setAppliedIndex(index);
      setTimeout(() => setAppliedIndex(null), 2000);
    } catch (err) {
      console.error('[AIWEB] Failed to send component to extension:', err);
    }
  }, []);

  const handleApplyImage = useCallback((imageDataUrl: string, index: number) => {
    try {
      if (window.opener) {
        window.opener.postMessage({ source: 'preta-aiweb', type: 'apply-image-banner', payload: imageDataUrl }, '*');
      }
      setAppliedIndex(100 + index); // offset to distinguish from component indices
      setTimeout(() => setAppliedIndex(null), 2000);
    } catch (err) {
      console.error('[AIWEB] Failed to send image to extension:', err);
    }
  }, []);

  const handleApplyFigmaComponent = (comp: any) => {
    try {
      if (window.opener) {
        window.opener.postMessage({
          source: 'preta-aiweb',
          type: 'apply-component',
          payload: {
            id: comp.id,
            type: comp.type,
            text: comp.text,
            style: comp.style
          }
        }, '*');
      }
      // Show success briefly
      setFigmaError(`Applied ${comp.name}!`);
      setTimeout(() => setFigmaError(null), 2000);
    } catch (err) {
      console.error('[AIWEB] Failed to send component to extension:', err);
    }
  };

  const handleBack = () => {
    window.close();
    // Fallback: if window.close() is blocked, go back
    setTimeout(() => window.history.back(), 100);
  };

  const hasResults = components.length > 0 || imageResults.length > 0;

  return (
    <div className="app-layout">
      {/* ===== Header ===== */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">✦</div>
          <div>
            <div className="header-title">Preta AI</div>
            <div className="header-subtitle">Theme-aware component generator</div>
          </div>
        </div>
        <button className="back-btn" onClick={handleBack} suppressHydrationWarning>
          ← Back to Dock
        </button>
      </header>

      {/* ===== Main Content ===== */}
      <div className="main-content">
        {/* ===== Sidebar ===== */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-section-title">Generate Components</div>
            <div className="sidebar-section-subtitle">AI-powered, theme-matched generation</div>
          </div>

          <div className="sidebar-body">
            {/* Theme Source Area */}
            <div className="theme-info">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="theme-info-title">Theme Source</div>
                {themeSource === 'figma' && <span style={{ fontSize: 10, color: '#C084FC', fontWeight: 600 }}>FIGMA ACTIVE</span>}
              </div>

              <div className="theme-source-toggle">
                <button
                  className={`source-pill live ${themeSource === 'live' ? 'active' : ''}`}
                  onClick={() => handleSourceChange('live')}
                  suppressHydrationWarning
                >
                  🌐 Live
                </button>
                <button
                  className={`source-pill figma ${themeSource === 'figma' ? 'active' : ''}`}
                  onClick={() => handleSourceChange('figma')}
                  suppressHydrationWarning
                >
                  🎨 Figma
                </button>
              </div>

              {/* Figma Subsection */}
              {themeSource === 'figma' && (
                <div className="figma-section">
                  {!figmaConnected ? (
                    <button className="figma-connect-btn" onClick={handleConnectFigma} disabled={figmaLoading}>
                      {figmaLoading ? 'Connecting...' : 'Connect Figma Account'}
                    </button>
                  ) : (
                    <>
                      <div className="connection-badge">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="status-dot" />
                          <span style={{ fontSize: 11, color: '#C084FC', fontWeight: 500 }}>
                            {figmaConnection?.figmaUserName || 'Connected'}
                          </span>
                        </div>
                        <button onClick={handleDisconnect} style={{ border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.6 }}>✕</button>
                      </div>

                      <button className="browse-files-btn" onClick={handleShowFilePicker} disabled={figmaLoading}>
                        {figmaLoading ? 'Exploring...' : figmaConnection?.theme ? 'Change Design File' : 'Browse Figma Files'}
                      </button>

                      {showFilePicker && (
                        <div className="figma-file-picker">
                          {figmaLoading && figmaFiles.length === 0 ? (
                            <div className="figma-loading-list">
                              <div className="skeleton-item" />
                              <div className="skeleton-item" />
                              <div className="skeleton-item" />
                            </div>
                          ) : figmaFiles.length > 0 ? (
                            <div className="figma-file-grid">
                              {figmaFiles.map(f => (
                                <button key={f.key} className="figma-file-item" onClick={() => handleSelectFile(f.key)}>
                                  {f.thumbnail_url ? <img src={f.thumbnail_url} className="figma-thumb" alt="" /> : <div className="figma-thumb" style={{ background: '#333' }} />}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{f.project_name}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : figmaError === 'NEEDS_TEAM_SETUP' ? (
                            <div className="figma-empty-state">
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0', marginBottom: 8 }}>🔗 One-time setup</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.5 }}>
                                1. Open <a href="https://www.figma.com/files" target="_blank" rel="noopener" style={{ color: '#C084FC' }}>figma.com/files</a>
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.5 }}>
                                2. Click your team name on the left sidebar
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                                3. Copy the URL from the address bar and paste below
                              </div>
                              <div className="figma-manual-input">
                                <input
                                  type="text"
                                  placeholder="Paste your team page URL here..."
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                      handleTeamSetup(e.currentTarget.value.trim());
                                    }
                                  }}
                                  style={{
                                    width: '100%',
                                    background: '#0F172A',
                                    border: '1px solid rgba(192, 132, 252, 0.3)',
                                    borderRadius: 6,
                                    padding: '8px 10px',
                                    fontSize: 10,
                                    color: '#E2E8F0',
                                    outline: 'none',
                                  }}
                                />
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                                  Press <b>Enter</b> · After this, files load automatically forever!
                                </div>
                              </div>
                            </div>
                          ) : !figmaLoading && (
                            <div className="figma-empty-state">
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No files found in this team.</div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {figmaError && <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4 }}>{figmaError}</div>}
                </div>
              )}

              {/* Theme Colors Preview & Editor */}
              <div style={{ marginTop: 16 }}>
                <div className="theme-info-title" style={{ marginBottom: 8, fontSize: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Active Palette</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>Click to edit</span>
                </div>
                <div className="theme-colors">
                  <div className="theme-color-swatch" style={{ position: 'relative', overflow: 'hidden' }}>
                    <input
                      type="color"
                      value={theme.primaryColor || '#000000'}
                      onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                      style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                    <div className="theme-color-dot" style={{ background: theme.primaryColor, pointerEvents: 'none' }} />
                    <span className="theme-color-label" style={{ pointerEvents: 'none' }}>Primary</span>
                  </div>
                  <div className="theme-color-swatch" style={{ position: 'relative', overflow: 'hidden' }}>
                    <input
                      type="color"
                      value={theme.secondaryColor || '#000000'}
                      onChange={(e) => setTheme({ ...theme, secondaryColor: e.target.value })}
                      style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                    <div className="theme-color-dot" style={{ background: theme.secondaryColor, pointerEvents: 'none' }} />
                    <span className="theme-color-label" style={{ pointerEvents: 'none' }}>Secondary</span>
                  </div>
                  <div className="theme-color-swatch" style={{ position: 'relative', overflow: 'hidden' }}>
                    <input
                      type="color"
                      value={theme.backgroundColor || '#000000'}
                      onChange={(e) => setTheme({ ...theme, backgroundColor: e.target.value, surfaceColor: e.target.value })}
                      style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                    <div className="theme-color-dot" style={{ background: theme.backgroundColor, pointerEvents: 'none' }} />
                    <span className="theme-color-label" style={{ pointerEvents: 'none' }}>BG</span>
                  </div>
                  <div className="theme-color-swatch" style={{ position: 'relative', overflow: 'hidden' }}>
                    <input
                      type="color"
                      value={theme.textColor || '#000000'}
                      onChange={(e) => setTheme({ ...theme, textColor: e.target.value })}
                      style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                    <div className="theme-color-dot" style={{ background: theme.textColor, pointerEvents: 'none' }} />
                    <span className="theme-color-label" style={{ pointerEvents: 'none' }}>Text</span>
                  </div>
                </div>
              </div>

              {/* Discovered Components Section */}
              {themeSource === 'figma' && discoveredComponents.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="theme-info-title" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Discovered Components</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{discoveredComponents.length} found</span>
                  </div>
                  <div className="figma-discovered-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {discoveredComponents.map(comp => (
                      <button
                        key={comp.id}
                        className="figma-comp-item"
                        onClick={() => handleApplyFigmaComponent(comp)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          background: 'rgba(30, 41, 59, 0.4)',
                          border: '1px solid rgba(192, 132, 252, 0.1)',
                          borderRadius: 8,
                          width: '100%',
                          textAlign: 'left',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div className="comp-type-icon" style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          background: 'rgba(192, 132, 252, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10
                        }}>
                          {comp.type === 'button' ? '🔘' : comp.type === 'modal' ? '🗔' : '📦'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.name}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{comp.type} · Click to Import</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Component Type Selector */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>
                Component type
              </div>
              <div className="type-selector">
                {COMPONENT_TYPES.map(ct => (
                  <button
                    key={ct.key}
                    className={`type-pill ${selectedType === ct.key ? 'active' : ''}`}
                    onClick={() => setSelectedType(selectedType === ct.key ? null : ct.key)}
                    suppressHydrationWarning
                  >
                    <span>{ct.emoji}</span>
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Input */}
            <div className="prompt-card">
              <textarea
                className="prompt-textarea"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe the component you want to create..."
                rows={4}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <div className="prompt-footer">
                <div style={{ position: 'relative' }}>
                  <button
                    className="quick-prompts-btn"
                    onClick={() => setShowQuickPrompts(!showQuickPrompts)}
                    suppressHydrationWarning
                  >
                    ✨ Quick prompts
                    <span style={{
                      display: 'inline-block',
                      transform: showQuickPrompts ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                      fontSize: 10,
                    }}>▼</span>
                  </button>
                  {showQuickPrompts && (
                    <div className="quick-prompts-dropdown">
                      {QUICK_PROMPTS.map((qp, i) => (
                        <button
                          key={i}
                          className="quick-prompt-item"
                          onClick={() => {
                            setPrompt(qp);
                            setShowQuickPrompts(false);
                          }}
                        >
                          {qp}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ctrl+Enter</span>
              </div>
            </div>

            {/* Generate Button */}
            <button
              className="generate-btn"
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? (
                <>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Generating...
                </>
              ) : (
                <>
                  ✦ Generate with AI
                </>
              )}
            </button>

            {/* Error */}
            {error && (
              <div className="error-banner">{error}</div>
            )}
          </div>
        </aside>

        {/* ===== Results Container ===== */}
        <main className="results-container">
          {isLoading ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <div className="loading-text">Generating{selectedType ? ` ${selectedType}` : ''} variants...</div>
              <div className="loading-subtext">AI is crafting 3 theme-matched options</div>
            </div>
          ) : !hasResults ? (
            <div className="results-empty">
              <div className="results-empty-icon">✦</div>
              <h3>Ready to generate</h3>
              <p>
                Describe the UI component you want and AI will generate 3 theme-matched variants for you to choose from.
              </p>
            </div>
          ) : (
            <>
              {/* Reasoning */}
              {reasoning && (
                <div className="reasoning-banner">💡 {reasoning}</div>
              )}

              {/* Text Component Results */}
              {components.length > 0 && (
                <div className="results-grid">
                  {components.map((comp, idx) => (
                    <ComponentCard key={idx} component={comp} index={idx} onApply={handleApply} appliedIndex={appliedIndex} />
                  ))}
                </div>
              )}

              {/* Image Results */}
              {imageResults.length > 0 && (
                <div className="results-grid">
                  {imageResults.map((img, idx) => (
                    <div key={idx} className="result-card image-result-card">
                      <div className="result-card-header">
                        <span className="result-card-title">🖼️ Image Banner — Variant {idx + 1}</span>
                        <span className="result-card-badge">
                          {idx === 0 ? 'Photographic' : idx === 1 ? 'Gradient' : 'Minimalist'}
                        </span>
                      </div>
                      <div className="result-card-preview">
                        <img
                          src={`data:${img.mimeType};base64,${img.imageBase64}`}
                          alt={`AI Generated Banner Variant ${idx + 1}`}
                        />
                      </div>
                      <div className="result-card-actions">
                        <button
                          className="apply-btn"
                          onClick={() => handleApplyImage(`data:${img.mimeType};base64,${img.imageBase64}`, idx)}
                          style={appliedIndex === 100 + idx ? { background: 'var(--accent)', color: '#000' } : {}}
                        >
                          {appliedIndex === 100 + idx ? '✓ Applied!' : '🖼️ Apply this banner'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ============ Component Card ============

function ComponentCard({ component, index, onApply, appliedIndex }: {
  component: GeneratedComponent;
  index: number;
  onApply: (component: GeneratedComponent, index: number) => void;
  appliedIndex: number | null;
}) {
  const typeLabels: Record<string, string> = {
    button: '🔘 Button',
    modal: '📦 Modal',
    banner: '📢 Banner',
    badge: '🏷️ Badge',
    float: '⚡ FAB',
  };

  const isApplied = appliedIndex === index;

  return (
    <div className="result-card">
      <div className="result-card-header">
        <span className="result-card-title">
          {typeLabels[component.type] || component.type} — Variant {index + 1}
        </span>
        <span className="result-card-badge">V{index + 1}</span>
      </div>
      <div className="result-card-preview">
        <ComponentPreview component={component} />
      </div>
      <div className="result-card-actions">
        <button
          className="apply-btn"
          onClick={() => onApply(component, index)}
          style={isApplied ? { background: 'var(--accent)', color: '#000' } : {}}
        >
          {isApplied ? '✓ Applied!' : '✓ Apply to editor'}
        </button>
      </div>
    </div>
  );
}

// ============ Component Preview ============

function ComponentPreview({ component }: { component: GeneratedComponent }) {
  switch (component.type) {
    case 'button':
      return (
        <div style={{
          padding: '14px 32px',
          background: component.bgColor,
          color: component.textColor,
          borderRadius: component.borderRadius || '8px',
          fontSize: 14,
          fontWeight: 600,
          textAlign: 'center',
          cursor: 'default',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          {component.text || 'Button'}
        </div>
      );

    case 'modal':
      return (
        <div style={{
          background: component.bgColor,
          borderRadius: 12,
          padding: 24,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: component.textColor, marginBottom: 8 }}>
            {component.headline || 'Headline'}
          </div>
          <div style={{ fontSize: 12, color: component.textColor, opacity: 0.75, marginBottom: 18, lineHeight: 1.5 }}>
            {component.description || 'Description'}
          </div>
          <div style={{
            display: 'inline-block',
            padding: '10px 24px',
            background: component.buttonColor,
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
          }}>
            {component.buttonText || 'Button'}
          </div>
        </div>
      );

    case 'banner':
      return (
        <div style={{
          background: component.bgColor,
          borderRadius: 8,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: 12,
        }}>
          <span style={{ fontSize: 13, color: component.textColor, fontWeight: 500 }}>
            {component.bannerText || 'Banner text'}
          </span>
          {component.buttonText && (
            <span style={{
              padding: '7px 16px',
              background: component.buttonColor,
              color: component.bgColor,
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              {component.buttonText}
            </span>
          )}
        </div>
      );

    case 'badge':
      return (
        <span style={{
          padding: component.shape === 'round' ? '10px 10px' : '7px 16px',
          background: component.bgColor,
          color: component.textColor,
          borderRadius: component.shape === 'round' ? '50%'
            : component.shape === 'pill' ? '20px'
              : component.shape === 'square' ? '4px' : '6px',
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'center',
          minWidth: component.shape === 'round' ? 36 : 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {component.text || 'Badge'}
        </span>
      );

    case 'float':
      return (
        <div style={{
          width: 56,
          height: 56,
          borderRadius: component.borderRadius || '50%',
          background: component.bgColor,
          color: component.textColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          fontWeight: 700,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          cursor: 'default',
        }}>
          {component.icon || component.text?.charAt(0) || '💬'}
        </div>
      );

    default:
      return null;
  }
}
