// Clinic OS's look: the dentist's choice for this phone. "system" follows the phone's dark or light mode.
export type ThemePref = 'system' | 'light' | 'dark'

export const THEME_COOKIE = 'clinic-theme'
export const THEME_PREFS: ThemePref[] = ['system', 'light', 'dark']

export const themeFrom = (value: string | undefined): ThemePref => (value === 'light' || value === 'dark' ? value : 'system')
