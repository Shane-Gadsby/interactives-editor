//Things only a mounted part of the editor can do (open the Share dialog, run an export, play Preview), asked for by name from
//anywhere: the command palette, and later others. The top bar (and Preview's owner) listens; nothing here knows how they are done.
export type AppAction = 'preview' | 'share' | 'invite' | 'template' | 'history' | 'prefs' | 'motion' | 'reference' | 'export-html' | 'export-package' | 'export-json' | 'export-png' | 'export-svg' | 'export-lottie';

export const APP_ACTION_EVENT = 'ix-app-action';

export const requestAppAction = (action: AppAction): void => void window.dispatchEvent(new CustomEvent<AppAction>(APP_ACTION_EVENT, { detail: action }));
