(() => {
    const key = 'merge.theme';
    const system = window.matchMedia?.('(prefers-color-scheme: dark)');
    let choice = null;
    try {
        const saved = window.localStorage.getItem(key);
        if (saved === 'light' || saved === 'dark') choice = saved;
    } catch { /* The toggle still works when browser storage is unavailable. */ }

    function apply() {
        const dark = (choice || (system?.matches ? 'dark' : 'light')) === 'dark';
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        const button = document.getElementById('theme-toggle');
        if (!button) return;
        button.setAttribute('aria-pressed', String(dark));
        button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
        button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
        document.getElementById('theme-icon').textContent = dark ? '☀' : '◐';
        document.getElementById('theme-label').textContent = dark ? 'Light mode' : 'Dark mode';
    }

    // Apply before the stylesheet and body are rendered to avoid a light flash.
    apply();
    document.addEventListener('DOMContentLoaded', () => {
        apply();
        document.getElementById('theme-toggle').addEventListener('click', () => {
            choice = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            try { window.localStorage.setItem(key, choice); } catch { /* Session-only fallback. */ }
            apply();
        });
    });
    system?.addEventListener?.('change', () => { if (!choice) apply(); });
    window.addEventListener('storage', event => {
        if (event.key !== key && event.key !== null) return;
        choice = event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : null;
        apply();
    });
})();
