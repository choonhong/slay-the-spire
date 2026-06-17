import { useEffect, useState } from 'react';
import { fetchConfig, saveConfig, type AppConfig } from '../api';

export default function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savesPath, setSavesPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const cfg = await fetchConfig();
      setConfig(cfg);
      setSavesPath(cfg.savesPath ?? '');
    } catch {
      setError('Could not reach the backend.');
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      const updated = await saveConfig(savesPath);
      setConfig(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSavesPath('');
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
        <p className="text-sm text-gray-400 mt-1">
          Configure the path to your STS2 save files. Leave blank to use the default Mac path.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            STS2 Saves Directory
          </label>
          <input
            type="text"
            value={savesPath}
            onChange={e => setSavesPath(e.target.value)}
            placeholder="Leave blank for default Mac path"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-spire-500 font-mono"
          />
          {config?.resolvedSavesPath && (
            <p className="mt-1.5 text-xs text-gray-500 font-mono break-all">
              Active path: {config.resolvedSavesPath}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-spire-600 hover:bg-spire-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saving ? 'Saving...' : 'Save & Restart Watcher'}
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-md transition-colors"
          >
            Reset to Default
          </button>
          {success && (
            <span className="self-center text-sm text-green-400">Saved!</span>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-2 text-sm text-gray-400">
        <p className="font-medium text-gray-300">Default save path (Mac)</p>
        <code className="block text-xs font-mono text-gray-500 break-all">
          ~/Library/Application Support/SlayTheSpire2/steam/&lt;steamid&gt;/profile1/saves/history/
        </code>
        <ul className="mt-3 space-y-1 text-xs list-disc list-inside">
          <li>The watcher picks up new <code>.run</code> files automatically when you finish a run</li>
          <li>Existing runs are parsed on server startup</li>
          <li>Previously parsed runs are cached in SQLite and not re-parsed</li>
          <li>The database is stored at <code>data/sts2.db</code> in the project root</li>
        </ul>
      </div>
    </div>
  );
}
