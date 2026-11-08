import type { SVGProps } from 'react';

const P = (d: string) => (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d={d} />
  </svg>
);

export const Icons = {
  select: P('M5 3l14 8-6 2-3 6z'),
  hand: P('M8 13V5.5a1.5 1.5 0 013 0V11m0-6.5V4a1.5 1.5 0 013 0v7m0-5.5a1.5 1.5 0 013 0V13m0-4.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a6 6 0 01-4.9-2.5L4 15c-.8-1.2.3-2.7 1.7-2.2L8 14'),
  artboard: P('M7 3v18M17 3v18M3 7h18M3 17h18'),
  frame: P('M4 4h16v16H4zM4 9h16'),
  rect: P('M4 5h16v14H4z'),
  ellipse: P('M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z'),
  polygon: P('M12 3l8.5 6.2-3.2 10H6.7L3.5 9.2z'),
  star: P('M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'),
  line: P('M5 19L19 5'),
  pen: P('M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6M11 11a2 2 0 100-4 2 2 0 000 4z'),
  bend: P('M4 19c4 0 4-12 8-12s4 12 8 12M4 19a1 1 0 100 .01M20 19a1 1 0 100 .01M12 7a1 1 0 100 .01'),
  text: P('M5 6V4h14v2M12 4v16M9 20h6'),
  image: P('M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z'),
  button: P('M3 8h18v8H3zM8 12h8'),
  input: P('M3 7h18v10H3zM7 10v4'),
  link: P('M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'),
  // the same chain pulled apart, with the gap marked
  unlink: P('M15 9l3.3-3.3a2.8 2.8 0 00-4-4L11 5M9 15l-3.3 3.3a2.8 2.8 0 004 4L13 19M4 9h3M9 4v3M20 15h-3M15 20v-3'),
  embed: P('M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14'),
  video: P('M3 6h13v12H3zM16 10l5-3v10l-5-3'),
  draw: P('M3 4h18v14H3zM7 14l3-4 3 3 2-3 3 4M8 21h8'),
  shader: P('M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2zM19 3v4M17 5h4'),
  progress: P('M3 9h18v6H3zM3 9h9v6H3z'),
  chart: P('M4 4v16h16M8 16v-4M12 16V8M16 16v-6'),
  undo: P('M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3'),
  redo: P('M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3'),
  play: P('M7 4l13 8-13 8z'),
  pause: P('M7 4h3v16H7zM14 4h3v16h-3z'),
  stop: P('M6 6h12v12H6z'),
  eye: P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z'),
  eyeOff: P('M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2'),
  lock: P('M6 11h12v10H6zM8 11V7a4 4 0 018 0v4'),
  pin: P('M9 4h6l-1 6 3 3H7l3-3zM12 13v7'),
  unlock: P('M6 11h12v10H6zM8 11V7a4 4 0 017.7-1.5'),
  trash: P('M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3'),
  plus: P('M12 5v14M5 12h14'),
  themes: P('M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18M12 8h4M12 12h5M12 16h3'),
  info: P('M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.01'),
  copy: P('M8 8h12v12H8zM16 8V4H4v12h4'),
  home: P('M3 11l9-8 9 8M5 9v11h14V9'),
  download: P('M12 4v12M7 11l5 5 5-5M4 20h16'),
  upload: P('M12 20V8M7 13l5-5 5 5M4 4h16'),
  preview: P('M5 4l14 8-14 8z'),
  arrowLeft: P('M19 12H5M11 6l-6 6 6 6'),
  arrowRight: P('M5 12h14M13 6l6 6-6 6'),
  chevronRight: P('M9 6l6 6-6 6'),
  chevronDown: P('M6 9l6 6 6-6'),
  record: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="6" fill="currentColor" />
    </svg>
  ),
  key: P('M12 3l9 9-9 9-9-9z'),
  group: P('M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4v11'),
  code: P('M8 8l-4 4 4 4M16 8l4 4-4 4'),
  variable: P('M5 4c-2 3-2 13 0 16M19 4c2 3 2 13 0 16M9 9l6 6M15 9l-6 6'),
  logic: P('M5 6h4v4H5zM15 14h4v4h-4zM9 8h3v8h3'),
  timeline: P('M3 12h18M7 8v8M12 6v12M17 9v6'),
  more: P('M5 12h.01M12 12h.01M19 12h.01'),
  close: P('M6 6l12 12M18 6L6 18'),
  check: P('M5 12.5l4.5 4.5L19 7'),
  comment: P('M4 5h16v11H9.5L5 20v-4H4zM8 9h8M8 12h5'),
  note: P('M5 4h14v11l-5 5H5zM14 20v-5h5M8 9h8M8 12h4'),
  bell: P('M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21h4'),
  help: P('M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.3a2.6 2.6 0 015 .9c0 1.7-2.5 2.3-2.5 3.8M12 17.2v.1'),
  external: P('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5'),
  gear: P('M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'),
  pencil: P('M4 20c3-1 4-4 6-6s5-3 7-6c1.5-2.2-.8-4.5-3-3-3 2-4 5-6 7s-5 3-6 6z'),
  history: P('M3 12a9 9 0 103-6.7L3 8M3 3v5h5M12 7v5l3 2'),
  share: P('M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4'),
  start: P('M5 5v14M9 12l10-7v14z'),
  alignLeft: P('M4 3v18M8 7h12v4H8zM8 14h7v4H8z'),
  alignHCenter: P('M12 3v18M6 7h12v4H6zM8.5 14h7v4h-7z'),
  alignRight: P('M20 3v18M4 7h12v4H4zM9 14h7v4H9z'),
  alignTop: P('M3 4h18M7 8v12h4V8zM14 8v7h4V8z'),
  alignVCenter: P('M3 12h18M7 6v12h4V6zM14 8.5v7h4v-7z'),
  alignBottom: P('M3 20h18M7 4v12h4V4zM14 9v7h4V9z'),
  distH: P('M4 4v16M20 4v16M10 8h4v8h-4z'),
  distV: P('M4 4h16M4 20h16M8 10h8v4H8z'),
  union: P('M4 4h10v6h6v10H10v-6H4z'),
  subtract: P('M4 4h10v10H4zM14 10h6v10H10v-6'),
  intersect: P('M4 4h10v10H4zM10 10h10v10H10zM10 10h4v4h-4z'),
  exclude: P('M4 4h10v6h-4v4H4zM20 20H10v-6h4v-4h6z'),
  grid: P('M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16'),
  magnet: P('M5 3h4v8a3 3 0 006 0V3h4v8a7 7 0 01-14 0zM5 7h4M15 7h4'),
  // The Media Catalogue's own icon: tiny_usqilartoolbox's pix/media-catalogue-icon.svg (the TinyMCE button in StudyDesk), as
  // si-manager's manual-mode.js inlines it. Same shapes, filled with currentColor instead of the toolbox blue so it follows the
  // theme and the gold on state.
  catalogue: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M14,2H6L5,4H2C1.4,4,1,4.4,1,5v8c0,0.6,0.4,1,1,1h12c0.6,0,1-0.4,1-1V3C15,2.4,14.6,2,14,2z M13,12H3V6h2.6l1-2H13V12z" />
      <circle cx="10.6" cy="7.6" r="1.1" />
      <polygon points="4,11 6.4,7.8 8,10 9.3,8.6 11.4,11" />
    </svg>
  ),
  table: P('M4 5h16v14H4zM4 10h16M4 15h16M10 5v14'),
  folder: P('M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z'),
  tag: P('M3 12V4h8l10 10-8 8zM8 8h.01'),
  bone: P('M6 6a2 2 0 100-4 2 2 0 000 4zM18 22a2 2 0 100-4 2 2 0 000 4zM7.4 5.4l3 .3 8.6 8.6-.3 3M5.4 7.4l.3 3 8.6 8.6 3-.3'),
  a11y: P('M12 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM4 8c5 1.5 11 1.5 16 0M12 8v6m0 0l-3.5 7M12 14l3.5 7'),
  question: P('M4 5h16v11H10l-5 4v-4H4zM8.5 10.5l2.2 2.2 4.3-4.6'),
  plug: P('M9 3v5M15 3v5M6 8h12v4a6 6 0 01-12 0zM12 18v3'),
  insights: P('M4 20V10M10 20V4M16 20v-8M22 20H2'),
  credits: P('M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11M9 8h6'),
  usage: P('M6 6a2 2 0 100-4 2 2 0 000 4zM18 14a2 2 0 100-4 2 2 0 000 4zM6 22a2 2 0 100-4 2 2 0 000 4zM6 6v12M6 12h8a4 4 0 004-4'),
};

export type IconName = keyof typeof Icons;
