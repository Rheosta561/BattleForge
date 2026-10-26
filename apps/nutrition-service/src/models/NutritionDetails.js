'use strict';

/**
 * Detailed micronutrient and macronutrient breakdown schema,
 * directly referencing NofOne's nutrition detail specifications.
 */
const NUTRITION_DETAIL_FIELDS = Object.freeze([
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietaryFibre',
  'starch',
  'sugar',
  'addedSugars',
  'sugarAlcohols',
  'otherCarbs',
  'netCarbs',
  'saturatedFat',
  'transFat',
  'polyunsaturatedFat',
  'monounsaturatedFat',
  'otherFat',
  'cholesterol',
  'sodium',
  'calcium',
  'iron',
  'potassium',
  'vitaminA',
  'vitaminC',
  'vitaminD'
]);

function round(value, precision = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(precision));
}

function normalizeNutritionDetails(details = null) {
  if (!details || typeof details !== 'object') {
    return null;
  }

  const normalized = {};
  for (const field of NUTRITION_DETAIL_FIELDS) {
    const val = details[field];
    if (val === undefined || val === null || val === '') {
      continue;
    }
    const num = Number(val);
    if (Number.isFinite(num) && num >= 0) {
      normalized[field] = round(num, 2);
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

module.exports = {
  NUTRITION_DETAIL_FIELDS,
  normalizeNutritionDetails,
  round
};
