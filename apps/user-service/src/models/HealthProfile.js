'use strict';

const crypto = require('crypto');

const ACTIVITY_LEVELS = Object.freeze(['sedentary', 'light', 'moderate', 'active', 'very_active']);
const FITNESS_GOALS   = Object.freeze(['lose_weight', 'gain_weight', 'maintain', 'build_muscle', 'improve_endurance']);
const DIET_TYPES      = Object.freeze(['balanced', 'keto', 'vegan', 'vegetarian', 'paleo', 'mediterranean', 'gluten_free', 'lactose_free', 'other']);

const ACTIVITY_FACTORS = {
  sedentary:   1.2,
  light:       1.375,
  moderate:    1.55,
  active:      1.725,
  very_active: 1.9
};

function round (value, precision = 1) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(precision));
}

/**
 * HealthProfile — stores per-user body metrics, dietary preferences,
 * health conditions and computed goal targets.
 *
 * Firestore collection: `healthProfiles`
 * Document ID         : the user's Firebase UID
 *
 * Mirrors NofOne's `healthProfile.model.js` but expressed as a proper
 * class to match Lagertha's OO model conventions.
 */
class HealthProfile {
  constructor ({
    ownerUid,
    age = null,
    gender = null,        // 'male' | 'female' | 'other' | null
    height = null,        // cm
    weight = null,        // kg
    targetWeight = null,  // kg
    bmi = null,
    bmiCategory = null,   // 'underweight' | 'normal' | 'overweight' | 'obese'
    // ── Fitness Goals ──────────────────────────────────────────────────────────
    activityLevel = 'moderate',
    goal = 'maintain',
    // ── Custom Nutrition Targets (override auto-computed) ──────────────────────
    targetCalories = null,
    targetBurn = null,    // target exercise calorie burn
    targetProtein = null, // g
    targetCarbs = null,   // g
    targetFat = null,     // g
    // ── Water & Sleep Targets ─────────────────────────────────────────────────
    targetWaterCups = 8,
    targetSleepHours = 8,
    // ── Dietary Preferences ───────────────────────────────────────────────────
    dietType = null,
    allergies = [],
    foodDislikes = [],
    // ── Health Conditions ─────────────────────────────────────────────────────
    diabetes = null,
    hypertension = null,
    cholesterol = null,
    cancerSurvivor = null,
    hrt = null,
    otherConditions = null,
    // ── Location & Cuisine ───────────────────────────────────────────────────
    location = null,
    city = null,
    ethnicityCuisine = null,
    // ── AI Context ───────────────────────────────────────────────────────────
    aiNotes = [],
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('HealthProfile requires a valid ownerUid');
    }

    this.ownerUid   = ownerUid.trim();
    this.age        = age != null && Number.isFinite(Number(age)) ? Math.round(Number(age)) : null;
    this.gender     = gender || null;
    this.height     = height != null && Number.isFinite(Number(height)) ? round(Number(height), 1) : null;
    this.weight     = weight != null && Number.isFinite(Number(weight)) ? round(Number(weight), 1) : null;
    this.targetWeight = targetWeight != null && Number.isFinite(Number(targetWeight)) ? round(Number(targetWeight), 1) : null;
    this.bmi        = bmi != null && Number.isFinite(Number(bmi)) ? round(Number(bmi), 1) : this.computeBmi();
    this.bmiCategory = bmiCategory || this.classifyBmi(this.bmi);

    this.activityLevel = ACTIVITY_LEVELS.includes(activityLevel) ? activityLevel : 'moderate';
    this.goal          = FITNESS_GOALS.includes(goal) ? goal : 'maintain';

    // Compute auto targets then allow override
    const auto = this.estimateDailyGoals();
    this.targetCalories = targetCalories != null ? Number(targetCalories) : auto.calories;
    this.targetBurn     = targetBurn     != null ? Number(targetBurn)     : null;
    this.targetProtein  = targetProtein  != null ? Number(targetProtein)  : auto.protein;
    this.targetCarbs    = targetCarbs    != null ? Number(targetCarbs)    : auto.carbs;
    this.targetFat      = targetFat      != null ? Number(targetFat)      : auto.fat;
    this.targetWaterCups  = Math.max(1, Number(targetWaterCups) || 8);
    this.targetSleepHours = Math.min(24, Math.max(1, Number(targetSleepHours) || 8));

    this.dietType     = DIET_TYPES.includes(dietType) ? dietType : null;
    this.allergies    = Array.isArray(allergies) ? allergies.slice(0, 30) : [];
    this.foodDislikes = Array.isArray(foodDislikes) ? foodDislikes.slice(0, 30) : [];

    this.diabetes      = diabetes      || null;
    this.hypertension  = hypertension  || null;
    this.cholesterol   = cholesterol   || null;
    this.cancerSurvivor = cancerSurvivor || null;
    this.hrt           = hrt           || null;
    this.otherConditions = otherConditions || null;

    this.location        = location || null;
    this.city            = city     || null;
    this.ethnicityCuisine = ethnicityCuisine || null;
    this.aiNotes         = Array.isArray(aiNotes) ? aiNotes.slice(0, 20) : [];

    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  computeBmi () {
    if (!this.weight || !this.height) return null;
    const heightM = this.height / 100;
    return round(this.weight / (heightM * heightM), 1);
  }

  classifyBmi (bmi) {
    if (bmi == null) return null;
    if (bmi < 18.5) return 'underweight';
    if (bmi < 25)   return 'normal';
    if (bmi < 30)   return 'overweight';
    return 'obese';
  }

  /**
   * Auto-computes daily macro targets using Mifflin-St Jeor BMR.
   * Mirrors NofOne `estimateDailyGoals` exactly.
   */
  estimateDailyGoals () {
    const weight       = Number(this.weight) || 70;
    const height       = Number(this.height) || 170;
    const age          = Number(this.age)    || 30;
    const gender       = String(this.gender || '').toLowerCase();
    const actFactor    = ACTIVITY_FACTORS[this.activityLevel] || ACTIVITY_FACTORS.moderate;

    const bmrBase      = 10 * weight + 6.25 * height - 5 * age;
    const genderOffset = gender === 'male' ? 5 : gender === 'female' ? -161 : 0;
    const maintenance  = (bmrBase + genderOffset) * actFactor;

    const goalAdj = this.goal === 'lose_weight' ? -450 : this.goal === 'gain_weight' ? 300 : 0;
    const calories = Math.max(1200, Math.round(maintenance + goalAdj));

    const protein = round(weight * (this.goal === 'lose_weight' ? 1.35 : 1.2), 0);
    const fat     = round((calories * 0.25) / 9, 0);
    const carbs   = round(Math.max(calories - protein * 4 - fat * 9, 0) / 4, 0);

    return { calories, protein, carbs, fat };
  }

  get computedTargets () {
    return {
      calories:  this.targetCalories,
      protein:   this.targetProtein,
      carbs:     this.targetCarbs,
      fat:       this.targetFat,
      waterCups: this.targetWaterCups,
      sleepHours: this.targetSleepHours,
      burn:      this.targetBurn
    };
  }

  toFirestore () {
    return {
      ownerUid:        this.ownerUid,
      age:             this.age,
      gender:          this.gender,
      height:          this.height,
      weight:          this.weight,
      targetWeight:    this.targetWeight,
      bmi:             this.bmi,
      bmiCategory:     this.bmiCategory,
      activityLevel:   this.activityLevel,
      goal:            this.goal,
      targetCalories:  this.targetCalories,
      targetBurn:      this.targetBurn,
      targetProtein:   this.targetProtein,
      targetCarbs:     this.targetCarbs,
      targetFat:       this.targetFat,
      targetWaterCups: this.targetWaterCups,
      targetSleepHours: this.targetSleepHours,
      dietType:        this.dietType,
      allergies:       this.allergies,
      foodDislikes:    this.foodDislikes,
      diabetes:        this.diabetes,
      hypertension:    this.hypertension,
      cholesterol:     this.cholesterol,
      cancerSurvivor:  this.cancerSurvivor,
      hrt:             this.hrt,
      otherConditions: this.otherConditions,
      location:        this.location,
      city:            this.city,
      ethnicityCuisine: this.ethnicityCuisine,
      aiNotes:         this.aiNotes,
      createdAt:       this.createdAt,
      updatedAt:       this.updatedAt
    };
  }

  toSafeJSON () {
    return {
      ...this.toFirestore(),
      computedTargets: this.computedTargets,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }

  static fromFirestore (data, uid) {
    if (!data) return null;
    const toDate = val => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    return new HealthProfile({
      ownerUid:        uid || data.ownerUid,
      age:             data.age,
      gender:          data.gender,
      height:          data.height,
      weight:          data.weight,
      targetWeight:    data.targetWeight,
      bmi:             data.bmi,
      bmiCategory:     data.bmiCategory,
      activityLevel:   data.activityLevel,
      goal:            data.goal,
      targetCalories:  data.targetCalories,
      targetBurn:      data.targetBurn,
      targetProtein:   data.targetProtein,
      targetCarbs:     data.targetCarbs,
      targetFat:       data.targetFat,
      targetWaterCups: data.targetWaterCups,
      targetSleepHours: data.targetSleepHours,
      dietType:        data.dietType,
      allergies:       data.allergies,
      foodDislikes:    data.foodDislikes,
      diabetes:        data.diabetes,
      hypertension:    data.hypertension,
      cholesterol:     data.cholesterol,
      cancerSurvivor:  data.cancerSurvivor,
      hrt:             data.hrt,
      otherConditions: data.otherConditions,
      location:        data.location,
      city:            data.city,
      ethnicityCuisine: data.ethnicityCuisine,
      aiNotes:         data.aiNotes,
      createdAt:       toDate(data.createdAt),
      updatedAt:       toDate(data.updatedAt)
    });
  }
}

HealthProfile.ACTIVITY_LEVELS  = ACTIVITY_LEVELS;
HealthProfile.FITNESS_GOALS    = FITNESS_GOALS;
HealthProfile.DIET_TYPES       = DIET_TYPES;
HealthProfile.collectionName   = 'healthProfiles';

module.exports = HealthProfile;
