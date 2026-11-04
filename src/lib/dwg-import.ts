import { isAsciiDxf, isBinaryDxf } from './dxf-parse';
import { importDxf, type DxfImport } from './dxf-import';

/**
 * AutoCAD DWG files.
 *
 * A DWG is a closed binary format: the newer versions (R2004 and later) compress and encrypt their sections, and entities are
 * bit-packed records addressed through a handle table. There is no reader here yet (see the README / help for what that takes), so
 * a DWG gets a clear message that names its version and says how to turn it into a DXF, which imports fully.
 * A file named .dwg that actually holds DXF content is read as DXF.
 */

/** DWG file versions: the six character code at the start of the file. */
export const DWG_VERSIONS: Record<string, string> = {
  AC1006: 'R10',
  AC1009: 'R11 / R12',
  AC1012: 'R13',
  AC1014: 'R14',
  AC1015: 'AutoCAD 2000',
  AC1018: 'AutoCAD 2004',
  AC1021: 'AutoCAD 2007',
  AC1024: 'AutoCAD 2010',
  AC1027: 'AutoCAD 2013',
  AC1032: 'AutoCAD 2018 and later',
};

export interface DwgVersion {
  /** `AC1032` and so on. */
  code: string;
  /** `AutoCAD 2018 and later`; empty for a code this list does not know. */
  name: string;
}

/** The version a DWG file says it is, or null when the bytes do not start like a DWG ("AC" and four digits). */
export function detectDwg(bytes: Uint8Array): DwgVersion | null {
  if (bytes.length < 6) return null;
  const code = String.fromCharCode(...bytes.subarray(0, 6));
  if (!/^AC\d{4}$/.test(code)) return null;
  return { code, name: DWG_VERSIONS[code] ?? '' };
}

/** The message shown for a DWG file. */
export function dwgMessage(v: DwgVersion): string {
  const label = v.name ? `DWG version ${v.code} (${v.name})` : `DWG version ${v.code}`;
  return `${label}: DWG files can't be read directly yet. Save it as DXF from your CAD program (File > Save As > DXF) and import that.`;
}

export function importDwg(bytes: Uint8Array, baseName = ''): DxfImport {
  if (isAsciiDxf(bytes) || isBinaryDxf(bytes)) return importDxf(bytes, baseName);
  const v = detectDwg(bytes);
  if (!v) throw new Error("This doesn't look like a DWG file (it doesn't start with a DWG version code). If it came from a CAD program, save it as DXF and import that.");
  throw new Error(dwgMessage(v));
}
