import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'skillswap_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function generateObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

class Store {
  constructor() {
    this.data = {
      users: [],
      profiles: [],
      skills: [],
      swapAgreements: [],
      conversations: [],
      messages: [],
      reports: [],
      auditLogs: [],
      notifications: []
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        if (!this.data.reports) this.data.reports = [];
        if (!this.data.auditLogs) this.data.auditLogs = [];
        if (!this.data.notifications) this.data.notifications = [];
      }
    } catch (err) {
      console.warn('⚠️ Could not load data file, starting with fresh in-memory state:', err.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('❌ Failed to save data file:', err.message);
    }
  }

  getCollection(name) {
    if (!this.data[name]) {
      this.data[name] = [];
    }
    return this.data[name];
  }
}

export const store = new Store();

function matchCriteria(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;

  for (const [key, val] of Object.entries(query)) {
    if (key === '$or') {
      const orMatched = val.some(subQuery => matchCriteria(doc, subQuery));
      if (!orMatched) return false;
      continue;
    }

    if (key === '$and') {
      const andMatched = val.every(subQuery => matchCriteria(doc, subQuery));
      if (!andMatched) return false;
      continue;
    }

    const docVal = getNested(doc, key);

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (val.$in && Array.isArray(val.$in)) {
        const inMatch = val.$in.some(target => {
          if (Array.isArray(docVal)) {
            return docVal.map(String).includes(String(target));
          }
          return String(docVal) === String(target);
        });
        if (!inMatch) return false;
        continue;
      }
      if (val.$all && Array.isArray(val.$all)) {
        if (!Array.isArray(docVal)) return false;
        const allMatch = val.$all.every(target =>
          docVal.map(String).includes(String(target))
        );
        if (!allMatch) return false;
        continue;
      }
      if (val.$ne !== undefined) {
        if (String(docVal) === String(val.$ne)) return false;
        continue;
      }
      if (val.$regex) {
        const flags = val.$options || '';
        const regex = new RegExp(val.$regex, flags);
        if (!regex.test(String(docVal || ''))) return false;
        continue;
      }
      if (val.$gte !== undefined) {
        if (Number(docVal) < Number(val.$gte)) return false;
        continue;
      }
      if (val.$lte !== undefined) {
        if (Number(docVal) > Number(val.$lte)) return false;
        continue;
      }
    }

    if (Array.isArray(docVal)) {
      if (!docVal.map(String).includes(String(val))) return false;
    } else {
      if (String(docVal) !== String(val)) return false;
    }
  }
  return true;
}

function getNested(obj, path) {
  if (!obj) return undefined;
  if (path in obj) return obj[path];
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[part];
  }
  return curr;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

class QueryCursor {
  constructor(collectionName, query = {}) {
    this.collectionName = collectionName;
    this.query = query;
    this._populates = [];
    this._sort = null;
    this._skip = null;
    this._limit = null;
    this._select = null;
    this._isFindOne = false;
  }

  populate(pathOrObj) {
    if (typeof pathOrObj === 'string') {
      this._populates.push({ path: pathOrObj });
    } else if (typeof pathOrObj === 'object') {
      this._populates.push(pathOrObj);
    }
    return this;
  }

  sort(sortObj) {
    this._sort = sortObj;
    return this;
  }

  skip(num) {
    this._skip = Number(num);
    return this;
  }

  limit(num) {
    this._limit = Number(num);
    return this;
  }

  select(fields) {
    this._select = fields;
    return this;
  }

  lean() {
    return this;
  }

  async distinct(field) {
    const coll = store.getCollection(this.collectionName);
    const matched = coll.filter(item => matchCriteria(item, this.query));
    const values = new Set();
    matched.forEach(item => {
      const val = getNested(item, field);
      if (val !== undefined && val !== null) {
        values.add(String(val));
      }
    });
    return Array.from(values);
  }

  async exec() {
    const coll = store.getCollection(this.collectionName);
    let matched = coll.filter(item => matchCriteria(item, this.query)).map(clone);

    if (this._sort) {
      matched.sort((a, b) => {
        for (const [key, dir] of Object.entries(this._sort)) {
          const aVal = getNested(a, key);
          const bVal = getNested(b, key);
          if (aVal < bVal) return dir === -1 ? 1 : -1;
          if (aVal > bVal) return dir === -1 ? -1 : 1;
        }
        return 0;
      });
    }

    if (this._skip && this._skip > 0) {
      matched = matched.slice(this._skip);
    }

    if (this._limit && this._limit > 0) {
      matched = matched.slice(0, this._limit);
    }

    // Process Populates
    for (const pop of this._populates) {
      for (const doc of matched) {
        await executePopulate(doc, pop);
      }
    }

    // Process Select (e.g. +password or -password)
    if (this._select) {
      const selectFields = typeof this._select === 'string' ? this._select.split(' ') : [];
      const excludes = selectFields.filter(f => f.startsWith('-')).map(f => f.slice(1));
      if (excludes.length > 0) {
        matched.forEach(doc => {
          excludes.forEach(field => delete doc[field]);
        });
      }
    } else {
      // By default hide password unless selected
      matched.forEach(doc => {
        if (doc.password && !this._select?.includes('+password')) {
          delete doc.password;
        }
      });
    }

    if (this._isFindOne) {
      return matched[0] || null;
    }
    return matched;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

async function executePopulate(doc, pop) {
  const pPath = pop.path;
  if (!doc) return;

  if (pPath === 'user') {
    const userColl = store.getCollection('users');
    const u = userColl.find(x => String(x._id) === String(doc.user));
    if (u) {
      const cu = clone(u);
      delete cu.password;
      doc.user = cu;
    }
  } else if (pPath === 'teachingSkills.skill') {
    const skillColl = store.getCollection('skills');
    if (Array.isArray(doc.teachingSkills)) {
      doc.teachingSkills.forEach(ts => {
        const s = skillColl.find(x => String(x._id) === String(ts.skill?._id || ts.skill));
        if (s) ts.skill = clone(s);
      });
    }
  } else if (pPath === 'learningSkills.skill') {
    const skillColl = store.getCollection('skills');
    if (Array.isArray(doc.learningSkills)) {
      doc.learningSkills.forEach(ls => {
        const s = skillColl.find(x => String(x._id) === String(ls.skill?._id || ls.skill));
        if (s) ls.skill = clone(s);
      });
    }
  } else if (pPath === 'proposer') {
    const userColl = store.getCollection('users');
    const u = userColl.find(x => String(x._id) === String(doc.proposer?._id || doc.proposer));
    if (u) {
      const cu = clone(u);
      delete cu.password;
      doc.proposer = cu;
    }
  } else if (pPath === 'recipient') {
    const userColl = store.getCollection('users');
    const u = userColl.find(x => String(x._id) === String(doc.recipient?._id || doc.recipient));
    if (u) {
      const cu = clone(u);
      delete cu.password;
      doc.recipient = cu;
    }
  } else if (pPath === 'offeredSkill') {
    const skillColl = store.getCollection('skills');
    const s = skillColl.find(x => String(x._id) === String(doc.offeredSkill?._id || doc.offeredSkill));
    if (s) doc.offeredSkill = clone(s);
  } else if (pPath === 'requestedSkill') {
    const skillColl = store.getCollection('skills');
    const s = skillColl.find(x => String(x._id) === String(doc.requestedSkill?._id || doc.requestedSkill));
    if (s) doc.requestedSkill = clone(s);
  } else if (pPath === 'sender') {
    const userColl = store.getCollection('users');
    const u = userColl.find(x => String(x._id) === String(doc.sender?._id || doc.sender));
    if (u) {
      const cu = clone(u);
      delete cu.password;
      doc.sender = cu;
    }
  } else if (pPath === 'participants') {
    const userColl = store.getCollection('users');
    if (Array.isArray(doc.participants)) {
      doc.participants = doc.participants.map(pid => {
        const u = userColl.find(x => String(x._id) === String(pid?._id || pid));
        if (u) {
          const cu = clone(u);
          delete cu.password;
          return cu;
        }
        return pid;
      });
    }
  } else if (pPath === 'swapAgreement') {
    const swapColl = store.getCollection('swapAgreements');
    const s = swapColl.find(x => String(x._id) === String(doc.swapAgreement?._id || doc.swapAgreement));
    if (s) {
      const cs = clone(s);
      // Also populate offeredSkill and requestedSkill inside swapAgreement if nested pop specifies
      const skillColl = store.getCollection('skills');
      const off = skillColl.find(x => String(x._id) === String(cs.offeredSkill?._id || cs.offeredSkill));
      if (off) cs.offeredSkill = clone(off);
      const req = skillColl.find(x => String(x._id) === String(cs.requestedSkill?._id || cs.requestedSkill));
      if (req) cs.requestedSkill = clone(req);
      doc.swapAgreement = cs;
    }
  } else if (pPath === 'lastMessage') {
    const msgColl = store.getCollection('messages');
    const m = msgColl.find(x => String(x._id) === String(doc.lastMessage?._id || doc.lastMessage));
    if (m) doc.lastMessage = clone(m);
  } else if (pPath.startsWith('ratings.rater')) {
    const userColl = store.getCollection('users');
    if (Array.isArray(doc.ratings)) {
      doc.ratings.forEach(r => {
        const u = userColl.find(x => String(x._id) === String(r.rater?._id || r.rater));
        if (u) {
          const cu = clone(u);
          delete cu.password;
          r.rater = cu;
        }
      });
    }
  } else if (pPath === 'reporter') {
    const userColl = store.getCollection('users');
    const u = userColl.find(x => String(x._id) === String(doc.reporter?._id || doc.reporter));
    if (u) {
      const cu = clone(u);
      delete cu.password;
      doc.reporter = cu;
    }
  } else if (pPath === 'reportedUser') {
    const userColl = store.getCollection('users');
    const u = userColl.find(x => String(x._id) === String(doc.reportedUser?._id || doc.reportedUser));
    if (u) {
      const cu = clone(u);
      delete cu.password;
      doc.reportedUser = cu;
    }
  } else if (pPath === 'assignedAdmin') {
    const userColl = store.getCollection('users');
    const u = userColl.find(x => String(x._id) === String(doc.assignedAdmin?._id || doc.assignedAdmin));
    if (u) {
      const cu = clone(u);
      delete cu.password;
      doc.assignedAdmin = cu;
    }
  } else if (pPath === 'adminId') {
    const userColl = store.getCollection('users');
    const u = userColl.find(x => String(x._id) === String(doc.adminId?._id || doc.adminId));
    if (u) {
      const cu = clone(u);
      delete cu.password;
      doc.adminId = cu;
    }
  } else if (pPath === 'resolution.resolvedBy') {
    const userColl = store.getCollection('users');
    if (doc.resolution && doc.resolution.resolvedBy) {
      const u = userColl.find(x => String(x._id) === String(doc.resolution.resolvedBy?._id || doc.resolution.resolvedBy));
      if (u) {
        const cu = clone(u);
        delete cu.password;
        doc.resolution.resolvedBy = cu;
      }
    }
  } else if (pPath === 'adminNotes.author') {
    const userColl = store.getCollection('users');
    if (Array.isArray(doc.adminNotes)) {
      doc.adminNotes.forEach(n => {
        const u = userColl.find(x => String(x._id) === String(n.author?._id || n.author));
        if (u) {
          const cu = clone(u);
          delete cu.password;
          n.author = cu;
        }
      });
    }
  }
}

export function createModelAdapter(collectionName) {
  return {
    collectionName,

    find(query = {}) {
      const cursor = new QueryCursor(collectionName, query);
      return cursor;
    },

    findOne(query = {}) {
      const cursor = new QueryCursor(collectionName, query);
      cursor._isFindOne = true;
      return cursor;
    },

    findById(id) {
      const cursor = new QueryCursor(collectionName, { _id: String(id) });
      cursor._isFindOne = true;
      return cursor;
    },

    distinct(field, query = {}) {
      return new QueryCursor(collectionName, query).distinct(field);
    },

    async create(docData) {
      const coll = store.getCollection(collectionName);
      const now = new Date();
      const newDoc = {
        _id: docData._id || generateObjectId(),
        ...docData,
        createdAt: docData.createdAt || now,
        updatedAt: docData.updatedAt || now
      };

      // Add _id to subdocuments if any
      if (Array.isArray(newDoc.teachingSkills)) {
        newDoc.teachingSkills.forEach(ts => {
          if (!ts._id) ts._id = generateObjectId();
        });
      }
      if (Array.isArray(newDoc.learningSkills)) {
        newDoc.learningSkills.forEach(ls => {
          if (!ls._id) ls._id = generateObjectId();
        });
      }
      if (Array.isArray(newDoc.milestones)) {
        newDoc.milestones.forEach(m => {
          if (!m._id) m._id = generateObjectId();
        });
      }

      coll.push(newDoc);
      store.save();

      const returnDoc = clone(newDoc);
      returnDoc.save = async function() {
        return returnDoc;
      };
      return returnDoc;
    },

    findByIdAndUpdate(id, update, options = {}) {
      const coll = store.getCollection(collectionName);
      const index = coll.findIndex(item => String(item._id) === String(id));
      if (index === -1) {
        const nullCursor = {
          populate() { return nullCursor; },
          then(r, rj) { return Promise.resolve(null).then(r, rj); }
        };
        return nullCursor;
      }

      const current = coll[index];
      const updatedFields = update.$set ? { ...update.$set } : { ...update };
      delete updatedFields.$set;

      // Handle $push
      if (update.$push) {
        for (const [key, val] of Object.entries(update.$push)) {
          if (!Array.isArray(current[key])) current[key] = [];
          if (val && typeof val === 'object' && !val._id) {
            val._id = generateObjectId();
          }
          current[key].push(val);
        }
      }

      // Handle $pull
      if (update.$pull) {
        for (const [key, filter] of Object.entries(update.$pull)) {
          if (Array.isArray(current[key])) {
            current[key] = current[key].filter(item => !matchCriteria(item, filter));
          }
        }
      }

      // Assign normal fields
      for (const [k, v] of Object.entries(updatedFields)) {
        current[k] = v;
      }
      current.updatedAt = new Date();

      coll[index] = current;
      store.save();

      const cursor = new QueryCursor(collectionName, { _id: String(id) });
      cursor._isFindOne = true;
      return cursor;
    },

    async updateOne(query, update) {
      const coll = store.getCollection(collectionName);
      const item = coll.find(doc => matchCriteria(doc, query));
      if (item) {
        await this.findByIdAndUpdate(item._id, update);
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    },

    async updateMany(query, update) {
      const coll = store.getCollection(collectionName);
      const matches = coll.filter(doc => matchCriteria(doc, query));
      for (const m of matches) {
        await this.findByIdAndUpdate(m._id, update);
      }
      return { modifiedCount: matches.length };
    },

    async deleteOne(query) {
      const coll = store.getCollection(collectionName);
      const index = coll.findIndex(doc => matchCriteria(doc, query));
      if (index !== -1) {
        coll.splice(index, 1);
        store.save();
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },

    async deleteMany(query = {}) {
      const coll = store.getCollection(collectionName);
      const initialLen = coll.length;
      const keep = coll.filter(doc => !matchCriteria(doc, query));
      store.data[collectionName] = keep;
      store.save();
      return { deletedCount: initialLen - keep.length };
    },

    async findByIdAndDelete(id) {
      return this.deleteOne({ _id: String(id) });
    },

    async findOneAndDelete(query) {
      return this.deleteOne(query);
    },

    async countDocuments(query = {}) {
      const coll = store.getCollection(collectionName);
      return coll.filter(doc => matchCriteria(doc, query)).length;
    }
  };
}
