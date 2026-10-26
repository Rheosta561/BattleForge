'use strict';

const crypto = require('crypto');
const { round } = require('./NutritionDetails');

const WATER_UNITS = Object.freeze(['cups', 'ml', 'fl_oz', 'liters']);
const DEFAULT_DAILY_TARGET_CUPS = 8;

class WaterLog {
  constructor ({
    id = crypto.randomUUID(),
    ownerUid,
    amount = 1,
    unit = 'cups',
    dailyTargetCups = DEFAULT_DAILY_TARGET_CUPS,
    loggedAt = new Date(),
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('WaterLog requires a valid ownerUid');
    }

    const safeAmount = Number(amount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      throw new TypeError('WaterLog amount must be greater than zero');
    }

    this.id = id;
    this.ownerUid = ownerUid.trim();
    this.amount = round(safeAmount, 2);
    this.unit = WATER_UNITS.includes(unit) ? unit : 'cups';
    this.dailyTargetCups = Math.max(1, Number(dailyTargetCups) || DEFAULT_DAILY_TARGET_CUPS);
    this.loggedAt = loggedAt instanceof Date ? loggedAt : new Date(loggedAt);
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  get amountInCups () {
    switch (this.unit) {
      case 'cups':
        return round(this.amount, 2);
      case 'ml':
        return round(this.amount / 240, 2);
      case 'fl_oz':
        return round(this.amount / 8, 2);
      case 'liters':
        return round((this.amount * 1000) / 240, 2);
      default:
        return round(this.amount, 2);
    }
  }

  get amountInMl () {
    switch (this.unit) {
      case 'ml':
        return round(this.amount, 0);
      case 'cups':
        return round(this.amount * 240, 0);
      case 'fl_oz':
        return round(this.amount * 29.5735, 0);
      case 'liters':
        return round(this.amount * 1000, 0);
      default:
        return round(this.amount * 240, 0);
    }
  }

  toFirestore () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      amount: this.amount,
      unit: this.unit,
      amountInCups: this.amountInCups,
      amountInMl: this.amountInMl,
      dailyTargetCups: this.dailyTargetCups,
      loggedAt: this.loggedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toSafeJSON () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      amount: this.amount,
      unit: this.unit,
      amountInCups: this.amountInCups,
      amountInMl: this.amountInMl,
      dailyTargetCups: this.dailyTargetCups,
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

    return new WaterLog({
      id: id || data.id,
      ownerUid: data.ownerUid,
      amount: data.amount,
      unit: data.unit,
      dailyTargetCups: data.dailyTargetCups,
      loggedAt: toDate(data.loggedAt),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    });
  }
}

WaterLog.WATER_UNITS = WATER_UNITS;
WaterLog.DEFAULT_DAILY_TARGET_CUPS = DEFAULT_DAILY_TARGET_CUPS;
WaterLog.collectionName = 'waterLogs';

module.exports = WaterLog;
