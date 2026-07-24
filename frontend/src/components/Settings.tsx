import { useEffect, useRef, useState } from 'react';
import { fetchConfig, saveConfig, uploadRuns } from '../api';
import { useAuth } from '../AuthContext';
import { THEMES, useTheme } from '../themes';
import PageHeader from './PageHeader';

const DEFAULT_SAVES_HINT = 'Leave blank to use the default path for your OS';

// Swatch colors per theme (bg, panel, accent)
const SWATCHES: Record<string, [string, string, string]> = {
  'ayu-dark':       ['#0d1017', '#131721', '#f2c357'],
  'tokyo-night':    ['#1a1b2e', '#24253a', '#7aa2f7'],
  'dracula':        ['#282a36', '#313341', '#bd93f9'],
  'catppuccin':     ['#1e1e2e', '#181825', '#cba6f7'],
  'gruvbox':        ['#282828', '#32302f', '#fabd2f'],
  'one-dark':       ['#21252b', '#2c313a', '#e5c07b'],
  'nord':           ['#2e3440', '#3b4252', '#88c0d0'],
  'solarized-dark': ['#002b36', '#073642', '#268bd2'],
  'monokai':        ['#272822', '#3e3d32', '#e6db74'],
  'material-ocean': ['#0f111a', '#1a1c2a', '#82aaff'],
  'palenight':      ['#292d3e', '#2f3448', '#c792ea'],
  'rose-pine':      ['#191724', '#26233a', '#ebbcba'],
  'everforest':     ['#2d353b', '#343f44', '#a7c080'],
  'horizon':        ['#1c1e26', '#232530', '#e95678'],
  'iceberg':        ['#161821', '#1e2132', '#84a0c6'],
  'night-owl':      ['#011627', '#021d36', '#82aaff'],
  'kanagawa':       ['#1f1f28', '#2a2a37', '#c0a36e'],
  'oxocarbon':      ['#1e1e1e', '#262626', '#78a9ff'],
  'cyberpunk':      ['#0e0e1f', '#14143a', '#ff007c'],
  'synthwave':      ['#241734', '#2d1b45', '#ff8fff'],
};

export default function Settings() {
  const { user } = useAuth();
  const { themeId, setThemeId } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    added: number;
    skipped: number;
    failed?: number;
  } | null>(null);
  const [savesPath, setSavesPath] = useState('');
  const [resolvedSavesPath, setResolvedSavesPath] = useState<string | null>(null);
  const [savingPath, setSavingPath] = useState(false);
  const [pathSaved, setPathSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConfig()
      .then(cfg => {
        setSavesPath(cfg.savesPath ?? '');
        setResolvedSavesPath(cfg.resolvedSavesPath ?? null);
      })
      .catch(() => setError('Could not load saves path config.'));
  }, []);

  const handleSavePath = async () => {
    setSavingPath(true);
    setPathSaved(false);
    setError(null);
    try {
      const updated = await saveConfig(savesPath);
      setSavesPath(updated.savesPath ?? '');
      setResolvedSavesPath(updated.resolvedSavesPath ?? null);
      setPathSaved(true);
      setTimeout(() => setPathSaved(false), 3000);
    } catch (err) {
      setError(`Failed to save path: ${String(err)}`);
    } finally {
      setSavingPath(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files ?? []);
    const files = all.filter(f => f.name.endsWith('.run'));
    if (!files.length) {
      setError('No .run files found in that selection.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    setUploadResult(null);
    setError(null);
    try {
      const payload = await Promise.all(
        files.map(async f => ({ filename: f.name, content: await f.text() }))
      );
      const result = await uploadRuns(payload);
      setUploadResult({
        added: result.added,
        skipped: result.skipped,
        failed: result.failed ?? result.errors?.length ?? 0,
      });
      if (result.errors?.length) {
        setError(`Some files failed: ${result.errors.slice(0, 3).join(', ')}${result.errors.length > 3 ? '…' : ''}`);
      }
    } catch (err) {
      setError(`Upload failed: ${String(err)}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />

      {/* Account info */}
      <div className="rounded-xl p-5 glass-sm">
        <p className="text-sm font-medium text-gray-300">Signed in as</p>
        <p className="text-base font-semibold text-spire-400 mt-0.5 break-all">{user?.username}</p>
      </div>

      {error && (
        <div className="rounded-xl p-3 text-red-300 text-sm glass-sm" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          {error}
        </div>
      )}

      {/* Local saves path */}
      <div className="rounded-xl p-5 space-y-4 glass-sm">
        <div>
          <p className="text-sm font-medium text-gray-300">Local saves directory</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Backend reads <code className="text-gray-400">current_run.save</code> for Advisor and watches
            for new <code className="text-gray-400">.run</code> files. Leave blank to use the default path
            for your OS. On Windows, the default root is <code className="text-gray-400">%APPDATA%\SlayTheSpire2\steam</code>.
          </p>
        </div>
        <input
          type="text"
          value={savesPath}
          onChange={e => setSavesPath(e.target.value)}
          spellCheck={false}
          placeholder={DEFAULT_SAVES_HINT}
          className="w-full px-4 py-2 rounded-full text-sm text-gray-100 font-mono placeholder-gray-600 glass-input"
        />
        {resolvedSavesPath && (
          <p className="text-[10px] text-gray-600 font-mono break-all">Active root path: {resolvedSavesPath}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSavePath}
            disabled={savingPath}
            className="px-5 py-2 bg-spire-600 hover:bg-spire-500 disabled:opacity-50 text-white text-sm font-medium rounded-full transition-colors"
          >
            {savingPath ? 'Saving…' : 'Save & Restart Watcher'}
          </button>
          <button
            type="button"
            onClick={() => setSavesPath('')}
            className="px-5 py-2 rounded-full text-gray-300 text-sm transition-all glass-button"
          >
            Reset to Default
          </button>
          {pathSaved && <span className="text-sm text-green-400">Saved — watcher restarted</span>}
        </div>
      </div>

      {/* Manual upload */}
      <div className="rounded-xl p-5 space-y-4 glass-sm">
        <div>
          <p className="text-sm font-medium text-gray-300">Upload run history</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Optional — finished runs are also imported automatically from the saves directory above.
            Use this to import a folder manually.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input ref={folderInputRef} type="file" multiple
            // @ts-expect-error webkitdirectory is a non-standard attribute
            webkitdirectory="" directory=""
            onChange={handleUpload} className="hidden" id="run-folder-input"
          />
          <label
            htmlFor="run-folder-input"
            className={`cursor-pointer px-5 py-2 bg-spire-600 hover:bg-spire-500 text-white text-sm font-medium rounded-full transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploading ? 'Uploading…' : 'Choose history folder…'}
          </label>

          <input ref={fileInputRef} type="file" accept=".run" multiple
            onChange={handleUpload} className="hidden" id="run-file-input"
          />
          <label
            htmlFor="run-file-input"
            className={`cursor-pointer px-5 py-2 rounded-full text-gray-200 text-sm font-medium transition-all glass-button ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            Choose .run files…
          </label>

          {uploadResult && (
            <span className="text-sm text-green-400">
              +{uploadResult.added} new run{uploadResult.added !== 1 ? 's' : ''} added
              {uploadResult.skipped > 0 && <span className="text-gray-500">, {uploadResult.skipped} already synced</span>}
              {(uploadResult.failed ?? 0) > 0 && <span className="text-red-400">, {uploadResult.failed} failed</span>}
            </span>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl p-5 space-y-4 text-sm text-gray-400 glass-sm">
        <p className="font-medium text-gray-300">How live sync works</p>
        <ul className="space-y-1 text-xs list-disc list-inside">
          <li><code className="text-gray-400">make dev</code> starts a watcher on your STS2 saves folder</li>
          <li>Advisor Sync re-reads <code className="text-gray-400">current_run.save</code> from disk</li>
          <li>New <code className="text-gray-400">.run</code> files are imported into your account automatically</li>
        </ul>
        <div className="pt-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="font-medium text-gray-300 text-xs">Default Mac path</p>
          <code className="block text-xs rounded-xl px-3 py-2 text-gray-300 break-all glass-sm">
            {DEFAULT_SAVES_HINT}
          </code>
        </div>
      </div>

      {/* Theme picker */}
      <div className="rounded-xl p-5 glass-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-300">Theme</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {THEMES.find(t => t.id === themeId)?.description ?? ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const [c1, c2, c3] = SWATCHES[themeId] ?? ['#222', '#333', '#888'];
              return (
                <span className="flex gap-1">
                  <span className="w-4 h-4 rounded-full" style={{ background: c1, border: '1px solid rgba(255,255,255,0.12)' }} />
                  <span className="w-4 h-4 rounded-full" style={{ background: c2 }} />
                  <span className="w-4 h-4 rounded-full" style={{ background: c3 }} />
                </span>
              );
            })()}
            <select
              value={themeId}
              onChange={e => setThemeId(e.target.value)}
              className="px-4 py-1.5 rounded-full text-sm text-gray-100 glass-input"
            >
              {THEMES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
