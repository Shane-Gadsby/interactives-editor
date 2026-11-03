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
  text: P('M5 6V4h14v2M12 4v16M9 20h6'),
  image: P('M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z'),
  button: P('M3 8h18v8H3zM8 12h8'),
  input: P('M3 7h18v10H3zM7 10v4'),
  link: P('M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'),
  embed: P('M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14'),
  video: P('M3 6h13v12H3zM16 10l5-3v10l-5-3'),
  undo: P('M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3'),
  redo: P('M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3'),
  play: P('M7 4l13 8-13 8z'),
  pause: P('M7 4h3v16H7zM14 4h3v16h-3z'),
  stop: P('M6 6h12v12H6z'),
  eye: P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z'),
  eyeOff: P('M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2'),
  lock: P('M6 11h12v10H6zM8 11V7a4 4 0 018 0v4'),
  unlock: P('M6 11h12v10H6zM8 11V7a4 4 0 017.7-1.5'),
  trash: P('M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3'),
  plus: P('M12 5v14M5 12h14'),
  copy: P('M8 8h12v12H8zM16 8V4H4v12h4'),
  home: P('M3 11l9-8 9 8M5 9v11h14V9'),
  download: P('M12 4v12M7 11l5 5 5-5M4 20h16'),
  upload: P('M12 20V8M7 13l5-5 5 5M4 4h16'),
  preview: P('M5 4l14 8-14 8z'),
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
  start: P('M5 5v14M9 12l10-7v14z'),
  table: P('M4 5h16v14H4zM4 10h16M4 15h16M10 5v14'),
};

export type IconName = keyof typeof Icons;
