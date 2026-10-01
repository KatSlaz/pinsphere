// Apply the saved appearance before the app loads to avoid a theme flash.
(function () {
    let theme = 'system';
    try {
        const savedTheme = localStorage.getItem('pinsphere-theme');
        if (['light', 'dark', 'system'].includes(savedTheme)) theme = savedTheme;
    } catch {
        // The app still works when browser storage is unavailable.
    }
    const dark = theme === 'dark' ||
        theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const root = document.documentElement;
    root.dataset.themePreference = theme;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.colorScheme = root.dataset.theme;
    root.style.backgroundColor = dark ? '#16171d' : '#fff';
})();