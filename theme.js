// theme.js
import { updateThemeToggleButton } from './ui.js';
import { playSound } from './sound.js'; // For playing a sound on theme toggle

const DARK_THEME_CLASS = 'dark-theme';
const LOCAL_STORAGE_KEY = 'darkTheme';

/**
 * Applies the theme (dark or light) to the document body.
 * @param {boolean} isDark - True to apply dark theme, false for light.
 */
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add(DARK_THEME_CLASS);
    } else {
        document.body.classList.remove(DARK_THEME_CLASS);
    }
    updateThemeToggleButton(isDark);
}

/**
 * Initializes the theme based on localStorage preference or system preference.
 * Called once on application load.
 */
export function initializeTheme() {
    const savedThemeIsDark = localStorage.getItem(LOCAL_STORAGE_KEY) === 'true';
    // You could also add a check for prefers-color-scheme if no localStorage item is found
    // const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    // const initialThemeIsDark = localStorage.getItem(LOCAL_STORAGE_KEY) !== null ? savedThemeIsDark : prefersDark;

    applyTheme(savedThemeIsDark);
}

/**
 * Toggles the theme between dark and light mode.
 * Updates localStorage and the theme toggle button.
 * Plays a sound effect.
 */
export function toggleTheme() { //
    const isCurrentlyDark = document.body.classList.contains(DARK_THEME_CLASS);
    const newThemeIsDark = !isCurrentlyDark;

    applyTheme(newThemeIsDark);
    localStorage.setItem(LOCAL_STORAGE_KEY, newThemeIsDark); //

    // The call to updateAllUIToggleButtons in the original game.js for theme toggle
    // was mainly to update the button icon, which is now handled by applyTheme->updateThemeToggleButton.
    // If other buttons' appearances depend on the theme, that logic would need to be revisited.
    // For now, direct update of the theme button is sufficient.

    playSound('move'); // Play a sound for feedback
}