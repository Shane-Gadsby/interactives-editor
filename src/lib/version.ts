declare const __IX_VERSION__: string | undefined;
declare const __IX_BUILD_ID__: string | undefined;

/** The editor's version (package.json) and build id (editor commit . player commit), set at build time. */
export const VERSION = typeof __IX_VERSION__ === 'string' ? __IX_VERSION__ : 'dev';
export const BUILD_ID = typeof __IX_BUILD_ID__ === 'string' ? __IX_BUILD_ID__ : 'dev';
export const VERSION_LABEL = `Version ${VERSION} · build ${BUILD_ID}`;
