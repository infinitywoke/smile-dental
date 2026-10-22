// Clinic OS's look: the dentist's choice for this phone. "system" follows the phone's dark or light mode.
export type ThemePref = 'system' | 'light' | 'dark'

export const THEME_COOKIE = 'clinic-theme'
export const THEME_PREFS: ThemePref[] = ['system', 'light', 'dark']

// Until he chooses, light: dark text on a light screen reads best in a bright surgery, above all on his
// phone's dim, glossy screen (Quiet Cockpit, owner's go-ahead 22 Oct)
export const themeFrom = (value: string | undefined): ThemePref => (value === 'system' || value === 'dark' ? value : 'light')
