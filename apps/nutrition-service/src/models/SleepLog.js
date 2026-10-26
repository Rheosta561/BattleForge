'use strict';

const crypto = require('crypto');
const { round } = require('./NutritionDetails');

const SLEEP_QUALITIES = Object.freeze(['poor', 'fair', 'good', 'excellent']);
const DEFAULT_SLEEP_HOURS_GOAL = 8;

class SleepLog {
  constructor ({
    id = crypto.randomUUID(),
    ownerUid,
    sleepHours = 8,
    bedtime = null,
    wakeTime = null,
    quality = 'good',
    weightKg = 70,
    sleepCalories = null,
    notes = null,
    loggedAt = new Date(),
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('SleepLog requires a valid ownerUid');
    }

    const safeHours = Number(sleepHours);
    if (!Number.isFinite(safeHours) || safeHours < 0 || safeHours > 24) {
      throw new TypeError('SleepLog sleepHours must be between 0 and 24');
    }

    this.id = id;
    this.ownerUid = ownerUid.trim();
    this.sleepHours = round(safeHours, 1);
    this.bedtime = bedtime instanceof Date ? bedtime.toISOString() : bedtime;
    this.wakeTime = wakeTime instanceof Date ? wakeTime.toISOString() : wakeTime;
    this.quality = SLEEP_QUALITIES.includes(quality) ? quality : 'good';
    this.notes = notes && typeof notes === 'string' ? notes.trim().slice(0, 300) : null;
    this.loggedAt = loggedAt instanceof Date ? loggedAt : new Date(loggedAt);
    this.sleepCalories = sleepCalories != null
      ? Math.max(0, Number(sleepCalories) || 0)
      : SleepLog.estimateSleepCalories(this.sleepHours, weightKg);
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  static estimateSleepCalories (hours, weightKg = 70) {
    const safeHours = Math.max(Number(hours) || 0, 0);
    const safeWeight = Math.max(Number(weightKg) || 70, 1);
    // Standard energy expenditure baseline: ~0.95 MET
    return round(safeHours * safeWeight * 0.95, 0);
  }

  toFirestore () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      sleepHours: this.sleepHours,
      bedtime: this.bedtime,
      wakeTime: this.wakeTime,
      quality: this.quality,
      sleepCalories: this.sleepCalories,
      notes: this.notes,
      loggedAt: this.loggedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toSafeJSON () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      sleepHours: this.sleepHours,
      bedtime: this.bedtime,
      wakeTime: this.wakeTime,
      quality: this.quality,
      sleepCalories: this.sleepCalories,
      notes: this.notes,
      loggedAt: this.loggedAt.toISOString(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }

  static fromFirestore (data, id) {
    if (!data) return null;
    const toDate = val => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    return new SleepLog({
      id: id || data.id,
      ownerUid: data.ownerUid,
      sleepHours: data.sleepHours,
      bedtime: data.bedtime,
      wakeTime: data.wakeTime,
      quality: data.quality,
      sleepCalories: data.sleepCalories,
      notes: data.notes,
      loggedAt: toDate(data.loggedAt),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    });
  }
}

SleepLog.SLEEP_QUALITIES = SLEEP_QUALITIES;
SleepLog.DEFAULT_SLEEP_HOURS_GOAL = DEFAULT_SLEEP_HOURS_GOAL;
SleepLog.collectionName = 'sleepLogs';

module.exports = SleepLog;
