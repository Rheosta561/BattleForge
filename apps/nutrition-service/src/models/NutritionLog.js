'use strict';

const crypto = require('crypto');

const MEAL_TYPES = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack', 'other']);

class NutritionLog {
  constructor ({
    id = crypto.randomUUID(),
    ownerUid,
    consumedAt = new Date(),
    mealType = 'breakfast',
    items = [],
    createdAt = new Date()
  } = {}) {
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('NutritionLog requires a valid ownerUid');
    }

    this.id = id;
    this.ownerUid = ownerUid.trim();
    this.consumedAt = consumedAt instanceof Date ? consumedAt : new Date(consumedAt);
    this.mealType = MEAL_TYPES.includes(mealType) ? mealType : 'other';
    this.items = Array.isArray(items) ? items.slice(0, 50) : [];
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  get totalCalories () {
    return this.items.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  }

  get totalProteinGrams () {
    return this.items.reduce((sum, item) => sum + (Number(item.proteinGrams) || 0), 0);
  }

  toFirestore () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      consumedAt: this.consumedAt,
      mealType: this.mealType,
      items: this.items,
      totalCalories: this.totalCalories,
      totalProteinGrams: this.totalProteinGrams,
      createdAt: this.createdAt
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
      items: data.items,
      createdAt: toDate(data.createdAt)
    });
  }
}

NutritionLog.MEAL_TYPES = MEAL_TYPES;

module.exports = NutritionLog;
