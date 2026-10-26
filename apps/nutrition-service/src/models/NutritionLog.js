'use strict';

const crypto = require('crypto');
const { normalizeNutritionDetails, round } = require('./NutritionDetails');

const MEAL_TYPES = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack', 'other']);

class NutritionLog {
  constructor ({
    id = crypto.randomUUID(),
    ownerUid,
    consumedAt = new Date(),
    mealType = 'breakfast',
    name = null,
    items = [],
    nutritionDetails = null,
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('NutritionLog requires a valid ownerUid');
    }

    this.id = id;
    this.ownerUid = ownerUid.trim();
    this.consumedAt = consumedAt instanceof Date ? consumedAt : new Date(consumedAt);
    this.mealType = MEAL_TYPES.includes(mealType) ? mealType : 'other';
    this.name = name && typeof name === 'string' ? name.trim().slice(0, 150) : null;
    this.items = Array.isArray(items) ? items.slice(0, 50).map(item => ({
      foodId: item.foodId || crypto.randomUUID(),
      name: item.name ? String(item.name).trim().slice(0, 100) : 'Food Item',
      servingSize: Number(item.servingSize) || 1,
      servingUnit: item.servingUnit ? String(item.servingUnit).trim().slice(0, 30) : 'serving',
      calories: Math.max(0, Number(item.calories) || 0),
      proteinGrams: Math.max(0, Number(item.proteinGrams ?? item.protein) || 0),
      carbsGrams: Math.max(0, Number(item.carbsGrams ?? item.carbs) || 0),
      fatGrams: Math.max(0, Number(item.fatGrams ?? item.fat) || 0),
      nutritionDetails: normalizeNutritionDetails(item.nutritionDetails)
    })) : [];

    this.nutritionDetails = normalizeNutritionDetails(nutritionDetails) || this.computeAggregatedNutritionDetails();
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  get totalCalories () {
    return round(this.items.reduce((sum, item) => sum + (Number(item.calories) || 0), 0), 1);
  }

  get totalProteinGrams () {
    return round(this.items.reduce((sum, item) => sum + (Number(item.proteinGrams) || 0), 0), 1);
  }

  get totalCarbsGrams () {
    return round(this.items.reduce((sum, item) => sum + (Number(item.carbsGrams) || 0), 0), 1);
  }

  get totalFatGrams () {
    return round(this.items.reduce((sum, item) => sum + (Number(item.fatGrams) || 0), 0), 1);
  }

  computeAggregatedNutritionDetails () {
    if (this.items.length === 0) return null;

    const aggregated = {};
    for (const item of this.items) {
      if (item.nutritionDetails) {
        for (const [key, value] of Object.entries(item.nutritionDetails)) {
          aggregated[key] = (aggregated[key] || 0) + (Number(value) || 0);
        }
      }
    }

    // Always include macro summaries in nutrition details
    aggregated.calories = this.totalCalories;
    aggregated.protein = this.totalProteinGrams;
    aggregated.carbs = this.totalCarbsGrams;
    aggregated.fat = this.totalFatGrams;

    return normalizeNutritionDetails(aggregated);
  }

  toFirestore () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      consumedAt: this.consumedAt,
      mealType: this.mealType,
      name: this.name,
      items: this.items,
      totalCalories: this.totalCalories,
      totalProteinGrams: this.totalProteinGrams,
      totalCarbsGrams: this.totalCarbsGrams,
      totalFatGrams: this.totalFatGrams,
      nutritionDetails: this.nutritionDetails,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toSafeJSON () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      consumedAt: this.consumedAt.toISOString(),
      mealType: this.mealType,
      name: this.name,
      items: this.items,
      totalCalories: this.totalCalories,
      totalProteinGrams: this.totalProteinGrams,
      totalCarbsGrams: this.totalCarbsGrams,
      totalFatGrams: this.totalFatGrams,
      nutritionDetails: this.nutritionDetails,
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

    return new NutritionLog({
      id: id || data.id,
      ownerUid: data.ownerUid,
      consumedAt: toDate(data.consumedAt),
      mealType: data.mealType,
      name: data.name,
      items: data.items,
      nutritionDetails: data.nutritionDetails,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    });
  }
}

NutritionLog.MEAL_TYPES = MEAL_TYPES;
NutritionLog.collectionName = 'nutritionLogs';

module.exports = NutritionLog;
