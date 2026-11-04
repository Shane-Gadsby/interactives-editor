//A tiny in-memory stand-in for the few mongodb collection methods the editor server uses (findOne, find with
//sort/skip/limit/projection, insertOne, updateOne with $set/$setOnInsert/$unset and upsert, deleteOne,
//deleteMany). Filters understand equality, dotted paths, null matching a missing field, arrays containing a value,
//$or, $and, $in, $ne and the $gt/$gte/$lt/$lte comparisons. That is all index.js asks of mongo, so the real route code runs against it untouched.

type Doc = Record<string, any>;

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

const getPath = (doc: Doc, path: string): any => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);

const eq = (a: any, b: any): boolean => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
};

function matchField(value: any, cond: any): boolean {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    return Object.entries(cond).every(([op, arg]) => {
      if (op === '$in') return (arg as any[]).some((x) => matchField(value, x));
      if (op === '$ne') return !matchField(value, arg);
      if (op === '$gte') return value !== undefined && value !== null && compare(value, arg) >= 0;
      if (op === '$gt') return value !== undefined && value !== null && compare(value, arg) > 0;
      if (op === '$lte') return value !== undefined && value !== null && compare(value, arg) <= 0;
      if (op === '$lt') return value !== undefined && value !== null && compare(value, arg) < 0;
      throw new Error(`fake mongo: ${op} is not supported`);
    });
  }
  if (cond === null) return value === null || value === undefined;
  if (Array.isArray(value)) return value.some((x) => eq(x, cond));
  return eq(value, cond);
}

export function matches(doc: Doc, filter: Doc = {}): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return (cond as Doc[]).some((f) => matches(doc, f));
    if (k === '$and') return (cond as Doc[]).every((f) => matches(doc, f));
    return matchField(getPath(doc, k), cond);
  });
}

function project(doc: Doc, projection?: Doc): Doc {
  const out = clone(doc);
  if (!projection) return out;
  const keys = Object.keys(projection).filter((k) => k !== '_id');
  if (keys.length && keys.every((k) => projection[k])) {
    const keep: Doc = {};
    if (projection._id !== 0) keep._id = out._id;
    for (const k of keys) {
      //dotted paths keep just that branch
      const v = getPath(out, k);
      if (v === undefined) continue;
      const parts = k.split('.');
      let at = keep;
      parts.slice(0, -1).forEach((part) => (at = at[part] ??= {}));
      at[parts[parts.length - 1]] = v;
    }
    return keep;
  }
  for (const k of keys) delete out[k];
  if (projection._id === 0) delete out._id;
  return out;
}

const compare = (a: any, b: any) => {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
};

class Cursor {
  private sortSpec: Doc | undefined;
  private skipN = 0;
  private limitN = Infinity;
  constructor(private rows: Doc[], private projection?: Doc) {}
  sort(spec: Doc) {
    this.sortSpec = spec;
    return this;
  }
  skip(n: number) {
    this.skipN = n;
    return this;
  }
  limit(n: number) {
    this.limitN = n || Infinity;
    return this;
  }
  async toArray() {
    let rows = [...this.rows];
    if (this.sortSpec) {
      for (const [k, dir] of Object.entries(this.sortSpec).reverse()) rows.sort((a, b) => compare(getPath(a, k), getPath(b, k)) * (dir as number));
    }
    rows = rows.slice(this.skipN, this.skipN + this.limitN);
    return rows.map((r) => project(r, this.projection));
  }
}

export class FakeCollection {
  docs: Doc[] = [];
  calls: string[] = [];
  /** Make the next call of this method reject (to check the route copes with mongo failing). */
  failNext: Record<string, Error | undefined> = {};

  private check(name: string) {
    this.calls.push(name);
    const err = this.failNext[name];
    if (err) {
      this.failNext[name] = undefined;
      throw err;
    }
  }

  async findOne(filter: Doc = {}, opts: { sort?: Doc; projection?: Doc } = {}) {
    this.check('findOne');
    let rows = this.docs.filter((d) => matches(d, filter));
    if (opts.sort) rows = (await new Cursor(rows).sort(opts.sort).toArray()) as Doc[];
    return rows[0] ? project(rows[0], opts.projection) : null;
  }

  find(filter: Doc = {}, opts: { sort?: Doc; skip?: number; projection?: Doc } = {}) {
    this.calls.push('find');
    const c = new Cursor(
      this.docs.filter((d) => matches(d, filter)),
      opts.projection,
    );
    if (opts.sort) c.sort(opts.sort);
    if (opts.skip) c.skip(opts.skip);
    return c;
  }

  async insertOne(doc: Doc) {
    this.check('insertOne');
    if (this.docs.some((d) => d._id === doc._id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    this.docs.push(clone(doc));
    return { insertedId: doc._id };
  }

  async updateOne(filter: Doc, update: Doc, opts: { upsert?: boolean } = {}) {
    this.check('updateOne');
    let doc = this.docs.find((d) => matches(d, filter));
    let inserted = false;
    if (!doc) {
      if (!opts.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      doc = {};
      for (const [k, v] of Object.entries(filter)) if (!k.startsWith('$') && (v === null || typeof v !== 'object')) doc[k] = v;
      this.docs.push(doc);
      inserted = true;
    }
    for (const [k, v] of Object.entries((update.$set ?? {}) as Doc)) doc[k] = clone(v);
    if (inserted) for (const [k, v] of Object.entries((update.$setOnInsert ?? {}) as Doc)) doc[k] = clone(v);
    for (const k of Object.keys((update.$unset ?? {}) as Doc)) delete doc[k];
    return { matchedCount: inserted ? 0 : 1, modifiedCount: 1, upsertedCount: inserted ? 1 : 0 };
  }

  async deleteOne(filter: Doc) {
    this.check('deleteOne');
    const i = this.docs.findIndex((d) => matches(d, filter));
    if (i >= 0) this.docs.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  }

  async deleteMany(filter: Doc) {
    this.check('deleteMany');
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, filter));
    return { deletedCount: before - this.docs.length };
  }
}

export class FakeDb {
  projects = new FakeCollection();
  revisions = new FakeCollection();
  prefs = new FakeCollection();
  libraries = new FakeCollection();
  'interactives-user-data' = new FakeCollection();
  ingest = new FakeCollection();
}
