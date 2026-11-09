//Things only a mounted part of the editor can do (open the Share dialog, run an export, play Preview), asked for by name from
//anywhere (the `-now` exports skip the "Before you share" list, for a caller that has just shown it): the command palette, and later others. The top bar (and Preview's owner) listens; nothing here knows how they are done.
export type AppAction = 'preview' | 'share' | 'invite' | 'template' | 'history' | 'prefs' | 'motion' | 'reference' | 'export-html' | 'export-package' | 'export-html-now' | 'export-package-now' | 'export-json' | 'export-png' | 'export-svg' | 'export-lottie' | 'export-dotlottie' | 'export-png-1x' | 'export-dts' | 'home';

export const APP_ACTION_EVENT = 'ix-app-action';

export const requestAppAction = (action: AppAction): void => void window.dispatchEvent(new CustomEvent<AppAction>(APP_ACTION_EVENT, { detail: action }));
