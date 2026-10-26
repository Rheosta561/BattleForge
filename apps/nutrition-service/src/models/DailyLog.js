'use strict';

const crypto = require('crypto');
const { round } = require('./NutritionDetails');
const SleepLog = require('./SleepLog');

/**
 * DailyLog — daily aggregate snapshot that mirrors the NofOne `dailyLogs` pattern.
 *
 * Firestore collection: `dailyLogs`
 * Document ID format  : `{uid}_{YYYY-MM-DD}` (deterministic — allows direct read without query)
 *
 * This document is created/updated whenever the user logs a meal, water intake,
 * sleep, workout, or weight. Downstream services (nutrition-service, workout-service)
 * call an update on this document so the front-end dashboard always has a single
 * pre-aggregated read.
 */
class DailyLog {
  constructor ({
    ownerUid,
    date,                          // ISO 8601 date string or Date — normalised to UTC midnight
    // Nutrition totals (rolled up from NutritionLog documents)
    calories = 0,
    protein = 0,
    carbs = 0,
    fat = 0,
    nutritionDetails = null,       // Aggregated micronutrient breakdown
    // Hydration (cups — rolled up from WaterLog documents)
    waterIntake = 0,
    // Sleep
    sleepHours = 0,
    sleepQuality = null,
    sleepCalories = null,          // Auto-computed if not provided
    // Exercise (rolled up from WorkoutLog documents)
    exerciseMinutes = 0,
    exerciseCalories = 0,
    // Body metrics (user self-reports)
    weight = null,
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('DailyLog requires a valid ownerUid');
    }

    const normalised = DailyLog.normaliseDate(date || new Date());

    this.ownerUid = ownerUid.trim();
    this.date = normalised;
    this.documentId = DailyLog.buildDocumentId(this.ownerUid, normalised);

    // Nutrition
    this.calories = Math.max(0, Number(calories) || 0);
    this.protein = Math.max(0, Number(protein) || 0);
    this.carbs = Math.max(0, Number(carbs) || 0);
    this.fat = Math.max(0, Number(fat) || 0);
    this.nutritionDetails = nutritionDetails && typeof nutritionDetails === 'object'
      ? nutritionDetails
      : null;

    // Hydration
    this.waterIntake = Math.max(0, Number(waterIntake) || 0);

    // Sleep
    const safeHours = Math.min(24, Math.max(0, Number(sleepHours) || 0));
    this.sleepHours = round(safeHours, 1);
    this.sleepQuality = sleepQuality || null;
    this.sleepCalories = sleepCalories != null
      ? Math.max(0, Number(sleepCalories) || 0)
      : SleepLog.estimateSleepCalories(this.sleepHours);

    // Exercise
    this.exerciseMinutes = Math.max(0, Number(exerciseMinutes) || 0);
    this.exerciseCalories = Math.max(0, Number(exerciseCalories) || 0);

    // Body
    this.weight = weight != null && Number.isFinite(Number(weight)) && Number(weight) > 0
      ? round(Number(weight), 1)
      : null;

    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  /**
   * Net calories: consumed − exercise burned − sleep burned.
   * Clamped to ≥ 0 for dashboard display safety.
   */
  get netCalories () {
    return Math.max(
      round(this.calories - this.exerciseCalories - this.sleepCalories, 0),
      0
    );
  }

  /**
   * Returns the UTC-midnight Date for any Date/ISO value.
   */
  static normaliseDate (value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new TypeError('DailyLog: invalid date value');
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /**
   * Deterministic Firestore document ID.
   * Format: `{uid}_{YYYY-MM-DD}` (same as NofOne pattern).
   */
  static buildDocumentId (ownerUid, normalisedDate) {
    const dateStr = normalisedDate instanceof Date
      ? normalisedDate.toISOString().slice(0, 10)
      : String(normalisedDate).slice(0, 10);
    return `${ownerUid}_${dateStr}`;
  }

  toFirestore () {
    return {
      ownerUid: this.ownerUid,
      date: this.date.toISOString(),
      calories: this.calories,
      protein: this.protein,
      carbs: this.carbs,
      fat: this.fat,
      nutritionDetails: this.nutritionDetails,
      waterIntake: this.waterIntake,
      sleepHours: this.sleepHours,
      sleepQuality: this.sleepQuality,
      sleepCalories: this.sleepCalories,
      exerciseMinutes: this.exerciseMinutes,
      exerciseCalories: this.exerciseCalories,
      weight: this.weight,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toSafeJSON () {
    return {
      ownerUid: this.ownerUid,
      date: this.date.toISOString().slice(0, 10),
      calories: this.calories,
      protein: this.protein,
      carbs: this.carbs,
      fat: this.fat,
      nutritionDetails: this.nutritionDetails,
      waterIntake: this.waterIntake,
      sleepHours: this.sleepHours,
      sleepQuality: this.sleepQuality,
      sleepCalories: this.sleepCalories,
      exerciseMinutes: this.exerciseMinutes,
      exerciseCalories: this.exerciseCalories,
      netCalories: this.netCalories,
      weight: this.weight,
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

    return new DailyLog({
      ownerUid: data.ownerUid,
      date: data.date,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      nutritionDetails: data.nutritionDetails,
      waterIntake: data.waterIntake,
      sleepHours: data.sleepHours,
      sleepQuality: data.sleepQuality,
      sleepCalories: data.sleepCalories,
      exerciseMinutes: data.exerciseMinutes,
      exerciseCalories: data.exerciseCalories,
      weight: data.weight,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    });
  }
}

DailyLog.collectionName = 'dailyLogs';

module.exports = DailyLog;
