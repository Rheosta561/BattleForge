'use strict';

const crypto = require('crypto');

const WORKOUT_STATUSES = Object.freeze(['inProgress', 'completed', 'abandoned']);

class ExerciseSet {
  constructor ({
    id = crypto.randomUUID(),
    logId,
    exerciseId,
    setNumber = 1,
    reps = 0,
    weight = 0,
    durationSeconds = 0,
    rpe = null,
    createdAt = new Date()
  } = {}) {
    if (!exerciseId || typeof exerciseId !== 'string') {
      throw new TypeError('ExerciseSet requires a valid exerciseId');
    }
    this.id = id;
    this.logId = logId || null;
    this.exerciseId = exerciseId;
    this.setNumber = Number.isInteger(setNumber) ? setNumber : 1;
    this.reps = typeof reps === 'number' && reps >= 0 ? reps : 0;
    this.weight = typeof weight === 'number' && weight >= 0 ? weight : 0;
    this.durationSeconds = typeof durationSeconds === 'number' && durationSeconds >= 0 ? durationSeconds : 0;
    this.rpe = typeof rpe === 'number' && rpe >= 1 && rpe <= 10 ? rpe : null;
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  toFirestore () {
    return {
      id: this.id,
      logId: this.logId,
      exerciseId: this.exerciseId,
      setNumber: this.setNumber,
      reps: this.reps,
      weight: this.weight,
      durationSeconds: this.durationSeconds,
      rpe: this.rpe,
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

    return new ExerciseSet({
      id: id || data.id,
      logId: data.logId,
      exerciseId: data.exerciseId,
      setNumber: data.setNumber,
      reps: data.reps,
      weight: data.weight,
      durationSeconds: data.durationSeconds,
      rpe: data.rpe,
      createdAt: toDate(data.createdAt)
    });
  }
}

class WorkoutLog {
  constructor ({
    id = crypto.randomUUID(),
    ownerUid,
    planId = null,
    startedAt = new Date(),
    completedAt = null,
    status = 'inProgress',
    durationSeconds = 0,
    notes = null,
    sets = [],
    createdAt = new Date()
  } = {}) {
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('WorkoutLog requires a valid ownerUid');
    }

    this.id = id;
    this.ownerUid = ownerUid.trim();
    this.planId = planId || null;
    this.startedAt = startedAt instanceof Date ? startedAt : new Date(startedAt);
    this.completedAt = completedAt ? (completedAt instanceof Date ? completedAt : new Date(completedAt)) : null;
    this.status = WORKOUT_STATUSES.includes(status) ? status : 'inProgress';
    this.durationSeconds = typeof durationSeconds === 'number' && durationSeconds >= 0 ? durationSeconds : 0;
    this.notes = notes && typeof notes === 'string' ? notes.trim().slice(0, 1000) : null;
    this.sets = Array.isArray(sets)
      ? sets.map(s => (s instanceof ExerciseSet ? s : new ExerciseSet({ ...s, logId: id })))
      : [];
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  toFirestore () {
    return {
      id: this.id,
      ownerUid: this.ownerUid,
      planId: this.planId,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      status: this.status,
      durationSeconds: this.durationSeconds,
      notes: this.notes,
      setsCount: this.sets.length,
      createdAt: this.createdAt
    };
  }

  static fromFirestore (data, id) {
    if (!data) return null;
    const toDate = val => {
      if (!val) return null;
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    return new WorkoutLog({
      id: id || data.id,
      ownerUid: data.ownerUid,
      planId: data.planId,
      startedAt: toDate(data.startedAt) || new Date(),
      completedAt: toDate(data.completedAt),
      status: data.status,
      durationSeconds: data.durationSeconds,
      notes: data.notes,
      sets: Array.isArray(data.sets) ? data.sets.map(s => ExerciseSet.fromFirestore(s)) : [],
      createdAt: toDate(data.createdAt) || new Date()
    });
  }
}

WorkoutLog.WORKOUT_STATUSES = WORKOUT_STATUSES;
WorkoutLog.ExerciseSet = ExerciseSet;

module.exports = { WorkoutLog, ExerciseSet };
