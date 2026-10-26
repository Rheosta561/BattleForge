'use strict';

const crypto = require('crypto');

const VISIBILITY_OPTIONS = Object.freeze(['private', 'shared']);

class WorkoutPlan {
  constructor ({
    id = crypto.randomUUID(),
    ownerUid,
    title,
    description = null,
    visibility = 'private',
    version = 1,
    days = [],
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('WorkoutPlan requires a valid ownerUid');
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new TypeError('WorkoutPlan requires a non-empty string title');
    }

    this.id = id;
    this.ownerUid = ownerUid.trim();
    this.title = title.trim().slice(0, 150);
    this.description = description && typeof description === 'string' ? description.trim().slice(0, 1000) : null;
    this.visibility = VISIBILITY_OPTIONS.includes(visibility) ? visibility : 'private';
    this.version = Number.isInteger(version) && version > 0 ? version : 1;
    this.days = Array.isArray(days) ? days.slice(0, 14) : [];
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  toFirestore () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      title: this.title,
      description: this.description,
      visibility: this.visibility,
      version: this.version,
      days: this.days,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static fromFirestore (data, id) {
    if (!data) return null;
    const toDate = val => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    return new WorkoutPlan({
      id: id || data.id,
      ownerUid: data.ownerUid,
      title: data.title,
      description: data.description,
      visibility: data.visibility,
      version: data.version,
      days: data.days,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    });
  }
}

WorkoutPlan.VISIBILITY_OPTIONS = VISIBILITY_OPTIONS;

module.exports = WorkoutPlan;
