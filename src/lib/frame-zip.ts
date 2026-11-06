import { Zip, ZipPassThrough } from 'fflate';
import { frameName } from './motion-frames';

/** A ZIP written as the frames arrive. PNG is already compressed, so entries are stored, not deflated again. */
export class FrameZip {
  private chunks: Uint8Array[] = [];
  private zip: Zip;
  private done: Promise<void>;
  private count = 0;

  constructor(private total: number) {
    this.zip = new Zip();
    this.done = new Promise((resolve, reject) => {
      this.zip.ondata = (err, data, final) => {
        if (err) return reject(err);
        this.chunks.push(data);
        if (final) resolve();
      };
    });
  }

  add(png: Uint8Array): string {
    const name = frameName(this.count++, this.total);
    const entry = new ZipPassThrough(name);
    this.zip.add(entry);
    entry.push(png, true);
    return name;
  }

  async finish(): Promise<Blob> {
    this.zip.end();
    await this.done;
    return new Blob(this.chunks as BlobPart[], { type: 'application/zip' });
  }
}
