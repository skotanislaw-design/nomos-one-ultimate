export function applyPreferences(prefs: Record<string, any>) {
  const html = document.documentElement;

  // Font size
  html.classList.remove('pref-font-small', 'pref-font-large');
  if (prefs.fontSize === 'small') html.classList.add('pref-font-small');
  else if (prefs.fontSize === 'large') html.classList.add('pref-font-large');

  // Theme
  html.classList.remove('theme-darker');
  if (prefs.theme === 'darker') {
    html.classList.add('theme-darker');
  } else if (prefs.theme === 'auto') {
    const hour = new Date().getHours();
    if (hour < 7 || hour >= 21) html.classList.add('theme-darker');
  }

  // Compact mode
  document.body.classList.toggle('compact-mode', !!prefs.compactMode);
}
