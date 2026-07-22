import { useState, useEffect } from 'react';

export interface Theme {
  id: string;
  name: string;
  description: string;
  bg950: string;
  bg900: string;
  bg800: string;
  bg700: string;
  border800: string;
  border700: string;
  text100: string;
  text200: string;
  text300: string;
  text400: string;
  text500: string;
  text600: string;
  spire400: string;
  spire500: string;
  spire600: string;
}

export const THEMES: Theme[] = [
  {
    id: 'ayu-dark',
    name: 'Ayu Dark',
    description: 'True dark · warm amber',
    bg950: '#0b0e14', bg900: '#0d1017', bg800: '#131721', bg700: '#1a2030',
    border800: '#1a2030', border700: '#273747',
    text100: '#e8e6dc', text200: '#cbc8bc', text300: '#9ca4af',
    text400: '#5c6773', text500: '#404a56', text600: '#2a3340',
    spire400: '#f2c357', spire500: '#daa830', spire600: '#b88820',
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    description: 'Midnight navy · electric blue',
    bg950: '#13141f', bg900: '#1a1b2e', bg800: '#24253a', bg700: '#343b58',
    border800: '#24253a', border700: '#343b58',
    text100: '#c0caf5', text200: '#a9b1d6', text300: '#787c99',
    text400: '#565f89', text500: '#414868', text600: '#2d3054',
    spire400: '#7aa2f7', spire500: '#5d87e0', spire600: '#3d59a1',
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Dark purple · lavender glow',
    bg950: '#191a21', bg900: '#282a36', bg800: '#313341', bg700: '#44475a',
    border800: '#313341', border700: '#44475a',
    text100: '#f8f8f2', text200: '#e0e0dc', text300: '#c0c0bb',
    text400: '#8b9bb4', text500: '#6272a4', text600: '#44475a',
    spire400: '#bd93f9', spire500: '#a67de0', spire600: '#8c62c9',
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    description: 'Soft warm-dark · pastel mauve',
    bg950: '#11111b', bg900: '#1e1e2e', bg800: '#181825', bg700: '#45475a',
    border800: '#313244', border700: '#45475a',
    text100: '#cdd6f4', text200: '#bac2de', text300: '#a6adc8',
    text400: '#7f849c', text500: '#6c7086', text600: '#585b70',
    spire400: '#cba6f7', spire500: '#b589ee', spire600: '#9a72d4',
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox Dark',
    description: 'Warm earthy tones · retro amber',
    bg950: '#1d2021', bg900: '#282828', bg800: '#32302f', bg700: '#504945',
    border800: '#32302f', border700: '#504945',
    text100: '#ebdbb2', text200: '#d5c4a1', text300: '#bdae93',
    text400: '#a89984', text500: '#928374', text600: '#7c6f64',
    spire400: '#fabd2f', spire500: '#d79921', spire600: '#b57614',
  },
  {
    id: 'one-dark',
    name: 'One Dark Pro',
    description: 'Classic VSCode dark · warm gold',
    bg950: '#1a1d27', bg900: '#21252b', bg800: '#2c313a', bg700: '#3e4451',
    border800: '#2c313a', border700: '#3e4451',
    text100: '#abb2bf', text200: '#9da5b4', text300: '#7f8a9a',
    text400: '#6b7280', text500: '#545f6e', text600: '#3a4252',
    spire400: '#e5c07b', spire500: '#d4a854', spire600: '#b88930',
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Arctic cool blues · crisp white',
    bg950: '#1e2128', bg900: '#2e3440', bg800: '#3b4252', bg700: '#434c5e',
    border800: '#3b4252', border700: '#434c5e',
    text100: '#eceff4', text200: '#e5e9f0', text300: '#d8dee9',
    text400: '#9ba3ba', text500: '#7b869a', text600: '#606882',
    spire400: '#88c0d0', spire500: '#5e9db3', spire600: '#4e889e',
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Classic teal dark · warm base',
    bg950: '#002028', bg900: '#002b36', bg800: '#073642', bg700: '#0a4050',
    border800: '#073642', border700: '#0a4050',
    text100: '#eee8d5', text200: '#e0d8ca', text300: '#d0c8b8',
    text400: '#657b83', text500: '#586e75', text600: '#4d6068',
    spire400: '#268bd2', spire500: '#1a7bb8', spire600: '#126099',
  },
  {
    id: 'monokai',
    name: 'Monokai',
    description: 'Classic dark · electric yellow',
    bg950: '#191919', bg900: '#272822', bg800: '#3e3d32', bg700: '#49483e',
    border800: '#3e3d32', border700: '#49483e',
    text100: '#f8f8f2', text200: '#e8e8e2', text300: '#ccccc0',
    text400: '#908f80', text500: '#75736a', text600: '#5c5a4e',
    spire400: '#e6db74', spire500: '#cfba50', spire600: '#b09730',
  },
  {
    id: 'material-ocean',
    name: 'Material Ocean',
    description: 'Deep space blue · bright blue',
    bg950: '#0c0e1a', bg900: '#0f111a', bg800: '#1a1c2a', bg700: '#292d3e',
    border800: '#1a1c2a', border700: '#292d3e',
    text100: '#eeffff', text200: '#d0e0f0', text300: '#8f93a2',
    text400: '#717a90', text500: '#525a70', text600: '#3a4258',
    spire400: '#82aaff', spire500: '#5d8af0', spire600: '#3d6ad0',
  },
  {
    id: 'palenight',
    name: 'Palenight',
    description: 'Indigo dark · soft purple',
    bg950: '#1a1b2e', bg900: '#292d3e', bg800: '#2f3448', bg700: '#3c4069',
    border800: '#2f3448', border700: '#3c4069',
    text100: '#a6accd', text200: '#9499b9', text300: '#7a80a0',
    text400: '#676b8a', text500: '#4f5470', text600: '#383c58',
    spire400: '#c792ea', spire500: '#b070d4', spire600: '#9550be',
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    description: 'Warm dark · dusty rose',
    bg950: '#13111b', bg900: '#191724', bg800: '#26233a', bg700: '#403d52',
    border800: '#26233a', border700: '#403d52',
    text100: '#e0def4', text200: '#d0ceec', text300: '#c0bede',
    text400: '#6e6a86', text500: '#524f6d', text600: '#3e3b52',
    spire400: '#ebbcba', spire500: '#d4a0a0', spire600: '#b88080',
  },
  {
    id: 'everforest',
    name: 'Everforest Dark',
    description: 'Forest green dark · warm green',
    bg950: '#1a1e1e', bg900: '#2d353b', bg800: '#343f44', bg700: '#3d484d',
    border800: '#343f44', border700: '#3d484d',
    text100: '#d3c6aa', text200: '#c3b69a', text300: '#9da492',
    text400: '#7a8478', text500: '#5c6360', text600: '#444e48',
    spire400: '#a7c080', spire500: '#87a662', spire600: '#6a8c4a',
  },
  {
    id: 'horizon',
    name: 'Horizon Dark',
    description: 'Near-black dark · hot pink',
    bg950: '#1a181e', bg900: '#1c1e26', bg800: '#232530', bg700: '#2e303e',
    border800: '#232530', border700: '#2e303e',
    text100: '#d5d8da', text200: '#c3c6c8', text300: '#a0a4aa',
    text400: '#7e828a', text500: '#606470', text600: '#454a58',
    spire400: '#e95678', spire500: '#d03a5e', spire600: '#b52548',
  },
  {
    id: 'iceberg',
    name: 'Iceberg',
    description: 'Cool grey-blue · slate blue',
    bg950: '#0f1117', bg900: '#161821', bg800: '#1e2132', bg700: '#272d43',
    border800: '#1e2132', border700: '#272d43',
    text100: '#c6c8d1', text200: '#b3b5be', text300: '#9093a0',
    text400: '#6e7180', text500: '#525568', text600: '#3a3e52',
    spire400: '#84a0c6', spire500: '#6080aa', spire600: '#40618e',
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Deep ocean dark · sky blue',
    bg950: '#011221', bg900: '#011627', bg800: '#021d36', bg700: '#062a47',
    border800: '#021d36', border700: '#062a47',
    text100: '#d6deeb', text200: '#c0c9dc', text300: '#8badc1',
    text400: '#5f8fa8', text500: '#406880', text600: '#28506a',
    spire400: '#82aaff', spire500: '#5d87e0', spire600: '#3d5fb0',
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    description: 'Japanese ink dark · gold',
    bg950: '#16161d', bg900: '#1f1f28', bg800: '#2a2a37', bg700: '#363646',
    border800: '#2a2a37', border700: '#363646',
    text100: '#dcd7ba', text200: '#c8c3a2', text300: '#a09880',
    text400: '#726a5c', text500: '#545048', text600: '#3c3830',
    spire400: '#c0a36e', spire500: '#a88748', spire600: '#8a6e30',
  },
  {
    id: 'oxocarbon',
    name: 'Oxocarbon',
    description: 'IBM Carbon dark · bright blue',
    bg950: '#161616', bg900: '#1e1e1e', bg800: '#262626', bg700: '#393939',
    border800: '#262626', border700: '#393939',
    text100: '#f4f4f4', text200: '#e0e0e0', text300: '#c6c6c6',
    text400: '#8d8d8d', text500: '#6f6f6f', text600: '#525252',
    spire400: '#78a9ff', spire500: '#5888e0', spire600: '#3868c0',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Deep midnight · neon pink',
    bg950: '#0d0d1a', bg900: '#0e0e1f', bg800: '#14143a', bg700: '#1f1f5e',
    border800: '#14143a', border700: '#1f1f5e',
    text100: '#f0f0ff', text200: '#d8d8f8', text300: '#a8a8e8',
    text400: '#7878b8', text500: '#505090', text600: '#303070',
    spire400: '#ff007c', spire500: '#dd0060', spire600: '#bb0048',
  },
  {
    id: 'synthwave',
    name: "Synthwave '84",
    description: 'Retro purple dark · hot magenta',
    bg950: '#1a0535', bg900: '#241734', bg800: '#2d1b45', bg700: '#3d2760',
    border800: '#2d1b45', border700: '#3d2760',
    text100: '#f9f0ff', text200: '#e0d0f8', text300: '#c4a8e8',
    text400: '#907aaa', text500: '#6a5685', text600: '#4d3c60',
    spire400: '#ff8fff', spire500: '#e070e0', spire600: '#c050c0',
  },
];

export const DEFAULT_THEME_ID = 'cyberpunk';
export const STORAGE_KEY = 'sts2-theme';

export function buildThemeCSS(t: Theme): string {
  return `
    :root, body { background-color: ${t.bg950} !important; }
    .bg-gray-950 { background-color: ${t.bg950} !important; }
    .bg-gray-900, .bg-gray-900\\/80 { background-color: ${t.bg900} !important; }
    .bg-gray-800, .bg-gray-800\\/50, .bg-gray-800\\/60 { background-color: ${t.bg800} !important; }
    .bg-gray-700 { background-color: ${t.bg700} !important; }
    .hover\\:bg-gray-800:hover { background-color: ${t.bg800} !important; }
    .hover\\:bg-gray-700:hover { background-color: ${t.bg700} !important; }
    .border-gray-800, .border-gray-800\\/60, .border-gray-800\\/40 { border-color: ${t.border800} !important; }
    .border-gray-700 { border-color: ${t.border700} !important; }
    .text-gray-100 { color: ${t.text100} !important; }
    .text-gray-200 { color: ${t.text200} !important; }
    .text-gray-300 { color: ${t.text300} !important; }
    .text-gray-400 { color: ${t.text400} !important; }
    .text-gray-500 { color: ${t.text500} !important; }
    .text-gray-600 { color: ${t.text600} !important; }
    .bg-spire-600 { background-color: ${t.spire600} !important; }
    .bg-spire-500 { background-color: ${t.spire500} !important; }
    .hover\\:bg-spire-500:hover { background-color: ${t.spire500} !important; }
    .text-spire-400 { color: ${t.spire400} !important; }
    .focus\\:border-spire-500:focus { border-color: ${t.spire500} !important; }
    .ring-spire-500 { --tw-ring-color: ${t.spire500} !important; }
    ::-webkit-scrollbar-thumb { background-color: ${t.bg700} !important; }
    ::-webkit-scrollbar-track { background-color: ${t.bg900} !important; }
  `;
}

export function applyTheme(themeId: string) {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];
  let el = document.getElementById('sts2-theme-override') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'sts2-theme-override';
    document.head.appendChild(el);
  }
  el.textContent = buildThemeCSS(theme);
}

export function useTheme() {
  const [themeId, setThemeIdState] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
    applyTheme(saved);
    return saved;
  });

  const setThemeId = (id: string) => {
    setThemeIdState(id);
    applyTheme(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  return { themeId, setThemeId };
}
