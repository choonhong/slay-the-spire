import { useEffect, useRef, useState } from 'react';
import { uploadRuns } from '../api';
import { useAuth } from '../AuthContext';
import { THEMES, useTheme } from '../themes';
import PageHeader from './PageHeader';

const LAST_PATH_KEY = 'sts2-last-upload-path';

/** Known STS2 history path on this Mac (browsers cannot read the absolute path from a picker). */
const DEFAULT_HISTORY_PATH =
  '/Users/choonhong/Library/Application Support/Steam/userdata/133818532/2868840/remote/profile1/saves/history';

/**
 * Resolve a display path from a FileList.
 * Chromium only exposes a relative folder name (e.g. "history"), never the real disk path.
 */
function pathFromFiles(files: File[], previous: string | null): string {
  const withRel = files.find(f => f.webkitRelativePath);
  if (withRel?.webkitRelativePath) {
    const parts = withRel.webkitRelativePath.split('/');
    parts.pop();
    const relative = parts.join('/');
    // If user already has a full path ending with this folder, keep it
    if (previous && (previous === relative || previous.endsWith('/' + relative) || previous.endsWith('\\' + relative))) {
      return previous;
    }
    // Common case: picked the STS2 history folder
    if (relative === 'history' || relative.endsWith('/history')) {
      return DEFAULT_HISTORY_PATH;
    }
    return relative || DEFAULT_HISTORY_PATH;
  }
  // Multi-file pick without folder context — keep previous full path if any
  if (previous && previous.includes('/')) return previous;
  if (files.length === 1) return files[0].name;
  return `${files.length} .run files`;
}

// Persisted folder handle key in IndexedDB (used by Advisor if previously connected)
const IDB_DB = 'sts2-tracker';
const IDB_STORE = 'config';
const IDB_KEY = 'folderHandle';

async function getIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await getIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function findCurrentRunSave(dir: FileSystemDirectoryHandle): Promise<string | null> {
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === 'file' && name === 'current_run.save') {
      const file = await (entry as FileSystemFileHandle).getFile();
      const buf = await file.arrayBuffer();
      return new TextDecoder('latin1').decode(buf);
    }
    if (entry.kind === 'directory') {
      const found = await findCurrentRunSave(entry as FileSystemDirectoryHandle);
      if (found) return found;
    }
  }
  return null;
}

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
  const [chosenPath, setChosenPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const savePath = (path: string) => {
    setChosenPath(path);
    localStorage.setItem(LAST_PATH_KEY, path);
  };

  useEffect(() => {
    const saved = localStorage.getItem(LAST_PATH_KEY);
    // Upgrade old short labels like "history" to the full path
    if (!saved || saved === 'history' || !saved.includes('/')) {
      savePath(DEFAULT_HISTORY_PATH);
    } else {
      setChosenPath(saved);
    }
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files ?? []);
    const files = all.filter(f => f.name.endsWith('.run'));
    if (!files.length) {
      setError('No .run files found in that selection.');
      e.target.value = '';
      return;
    }
    savePath(pathFromFiles(files, chosenPath));
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
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Upload your STS2 .run files to sync history to the server."
      />

      {/* Account info */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <p className="text-sm font-medium text-gray-300">Signed in as</p>
        <p className="text-base font-semibold text-spire-400 mt-0.5 break-all">{user?.username}</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Upload runs */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-300">Sync run history</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Select your <code className="text-gray-400">history</code> folder, or pick .run files directly. Only new runs are uploaded.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error webkitdirectory is a non-standard attribute
            webkitdirectory=""
            directory=""
            onChange={handleUpload}
            className="hidden"
            id="run-folder-input"
          />
          <label
            htmlFor="run-folder-input"
            className={`cursor-pointer px-4 py-2 bg-spire-600 hover:bg-spire-500 text-white text-sm font-medium rounded-md transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploading ? 'Uploading…' : 'Choose history folder…'}
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept=".run"
            multiple
            onChange={handleUpload}
            className="hidden"
            id="run-file-input"
          />
          <label
            htmlFor="run-file-input"
            className={`cursor-pointer px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-medium rounded-md transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            Choose .run files…
          </label>

          {uploadResult && (
            <span className="text-sm text-green-400">
              +{uploadResult.added} new run{uploadResult.added !== 1 ? 's' : ''} added
              {uploadResult.skipped > 0 && (
                <span className="text-gray-500">, {uploadResult.skipped} already synced</span>
              )}
              {(uploadResult.failed ?? 0) > 0 && (
                <span className="text-red-400">, {uploadResult.failed} failed</span>
              )}
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500">
          “Already synced” means those files are already in <em>your</em> account — not that upload failed.
          Card Stats defaults to <strong className="text-gray-400">My Stats</strong>; Global counts every account
          (duplicate uploads look inflated).
        </p>

        <div>
          <p className="text-xs text-gray-500 mb-1">Folder path</p>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-md">
            <span className="text-green-400 text-sm shrink-0">✓</span>
            <input
              type="text"
              value={chosenPath ?? ''}
              onChange={e => savePath(e.target.value)}
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 font-mono focus:outline-none"
              placeholder={DEFAULT_HISTORY_PATH}
            />
          </div>
          <p className="text-[10px] text-gray-600 mt-1">
            Browsers cannot read the absolute path from the folder picker — this is filled from your known Steam saves location and is editable.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4 text-sm text-gray-400">
        <p className="font-medium text-gray-300">How it works</p>
        <ul className="space-y-1 text-xs list-disc list-inside">
          <li>Click <strong>Choose history folder…</strong> and select your STS2 <code>history</code> folder</li>
          <li>Or use <strong>Choose .run files…</strong> and multi-select individual runs (⌘+A)</li>
          <li>Only new runs are uploaded — already synced files are skipped</li>
        </ul>

        <div className="border-t border-gray-800 pt-4 space-y-2">
          <p className="font-medium text-gray-300 text-xs">Find your runs folder</p>
          <p className="text-xs text-gray-500">Run files are saved by the game in your Steam user data folder:</p>
          <div className="space-y-1.5">
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">Windows</p>
              <code className="block text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-300 break-all">
                C:\Users\&lt;YourUsername&gt;\AppData\Roaming\SlayTheSpire2\steam\&lt;SteamID&gt;\profile1\saves\history
              </code>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-0.5">macOS</p>
              <code className="block text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-300 break-all">
                ~/Library/Application Support/Steam/userdata/&lt;SteamID&gt;/2868840/remote/profile1/saves/history
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Theme picker */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
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
                  <span className="w-4 h-4 rounded-sm" style={{ background: c1, border: '1px solid rgba(255,255,255,0.12)' }} />
                  <span className="w-4 h-4 rounded-sm" style={{ background: c2 }} />
                  <span className="w-4 h-4 rounded-sm" style={{ background: c3 }} />
                </span>
              );
            })()}
            <select
              value={themeId}
              onChange={e => setThemeId(e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:border-spire-500"
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

// Export helpers for use in Advisor tab
export { findCurrentRunSave, loadFolderHandle };
