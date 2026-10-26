'use strict';

const crypto = require('crypto');

const RECIPE_VISIBILITY = Object.freeze(['public', 'private']);

class Recipe {
  constructor ({
    id = crypto.randomUUID(),
    ownerUid = null,
    title,
    ingredientItems = [],
    instructions = [],
    visibility = 'public',
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new TypeError('Recipe requires a non-empty string title');
    }

    this.id = id;
    this.ownerUid = ownerUid && typeof ownerUid === 'string' ? ownerUid.trim() : null;
    this.title = title.trim().slice(0, 150);
    this.ingredientItems = Array.isArray(ingredientItems) ? ingredientItems.slice(0, 100) : [];
    this.instructions = Array.isArray(instructions) ? instructions.map(String).slice(0, 50) : [];
    this.visibility = RECIPE_VISIBILITY.includes(visibility) ? visibility : 'public';
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  toFirestore () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      title: this.title,
      ingredientItems: this.ingredientItems,
      instructions: this.instructions,
      visibility: this.visibility,
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

    return new Recipe({
      id: id || data.id,
      ownerUid: data.ownerUid,
      title: data.title,
      ingredientItems: data.ingredientItems,
      instructions: data.instructions,
      visibility: data.visibility,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    });
  }
}

Recipe.RECIPE_VISIBILITY = RECIPE_VISIBILITY;

module.exports = Recipe;
