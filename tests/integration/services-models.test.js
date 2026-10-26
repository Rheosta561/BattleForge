'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

// ─────────────────────────────────────────────────────────────────────────────
// 1. user-service
// ─────────────────────────────────────────────────────────────────────────────
test('user-service: User model', () => {
  const { User } = require('../../apps/user-service/src/models');
  const user = new User({ uid: 'u1', email: 'lagertha@kattegat.dev' });
  assert.equal(user.uid, 'u1');
  assert.equal(user.email, 'lagertha@kattegat.dev');
  assert.equal(user.preferences.units, 'metric');
  assert.equal(user.profileStatus, 'active');

  const fs = user.toFirestore();
  assert.equal(fs.uid, 'u1');

  const safe = user.toSafeJSON();
  assert.ok(typeof safe.createdAt === 'string', 'createdAt should be ISO string');

  assert.throws(() => new User({}), TypeError, 'requires uid');
});

test('user-service: HealthProfile model', () => {
  const { HealthProfile } = require('../../apps/user-service/src/models');

  // Auto-computed targets
  const profile = new HealthProfile({
    ownerUid: 'u1',
    age: 28,
    gender: 'female',
    height: 168,
    weight: 65,
    activityLevel: 'moderate',
    goal: 'lose_weight'
  });

  assert.equal(profile.ownerUid, 'u1');
  assert.ok(profile.bmi !== null, 'BMI should be auto-computed');
  assert.ok(profile.bmi > 0);
  assert.ok(['underweight','normal','overweight','obese'].includes(profile.bmiCategory));
  assert.ok(profile.targetCalories > 0, 'targetCalories should be estimated');
  assert.ok(profile.targetProtein > 0, 'targetProtein should be estimated');
  assert.equal(profile.targetWaterCups, 8);
  assert.equal(profile.targetSleepHours, 8);

  // Custom target override
  const custom = new HealthProfile({
    ownerUid: 'u2',
    weight: 80,
    height: 180,
    activityLevel: 'active',
    goal: 'build_muscle',
    targetCalories: 2800,
    targetProtein: 200,
    dietType: 'balanced',
    allergies: ['peanuts'],
    aiNotes: ['prefers morning workouts']
  });
  assert.equal(custom.targetCalories, 2800);
  assert.equal(custom.targetProtein, 200);
  assert.equal(custom.dietType, 'balanced');
  assert.deepEqual(custom.allergies, ['peanuts']);

  const fs = custom.toFirestore();
  assert.equal(fs.ownerUid, 'u2');

  const restored = HealthProfile.fromFirestore(fs, 'u2');
  assert.equal(restored.ownerUid, 'u2');
  assert.equal(restored.targetCalories, 2800);

  assert.throws(() => new HealthProfile({}), TypeError, 'requires ownerUid');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. workout-service
// ─────────────────────────────────────────────────────────────────────────────
test('workout-service: WorkoutPlan, WorkoutLog, ExerciseSet', () => {
  const { WorkoutPlan, WorkoutLog, ExerciseSet } = require('../../apps/workout-service/src/models');
  const plan = new WorkoutPlan({ ownerUid: 'u1', title: 'Shield Wall Routine' });
  const log  = new WorkoutLog({ ownerUid: 'u1', planId: plan.id });
  const set  = new ExerciseSet({ exerciseId: 'deadlift', reps: 5, weight: 140 });
  assert.equal(plan.title, 'Shield Wall Routine');
  assert.equal(log.status, 'inProgress');
  assert.equal(set.weight, 140);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. nutrition-service
// ─────────────────────────────────────────────────────────────────────────────
test('nutrition-service: NutritionLog with full macro + micronutrient items', () => {
  const { NutritionLog } = require('../../apps/nutrition-service/src/models');

  const log = new NutritionLog({
    ownerUid: 'u1',
    mealType: 'dinner',
    name: 'Post-Raid Feast',
    items: [
      {
        foodId: 'salmon',
        name: 'Wild Salmon',
        calories: 400,
        proteinGrams: 40,
        carbsGrams: 0,
        fatGrams: 20,
        nutritionDetails: {
          vitaminD: 15, omega3: 2.5, sodium: 80
        }
      },
      {
        foodId: 'quinoa',
        name: 'Quinoa',
        calories: 222,
        proteinGrams: 8,
        carbsGrams: 39,
        fatGrams: 3.5
      }
    ]
  });

  assert.equal(log.mealType, 'dinner');
  assert.equal(log.name, 'Post-Raid Feast');
  assert.equal(log.totalCalories, 622);
  assert.equal(log.totalProteinGrams, 48);
  assert.equal(log.totalCarbsGrams, 39);
  assert.ok(log.nutritionDetails !== null, 'should have aggregated nutritionDetails');

  const fs   = log.toFirestore();
  assert.equal(fs.totalCalories, 622);
  assert.ok(fs.nutritionDetails, 'Firestore payload should include nutritionDetails');

  const safe = log.toSafeJSON();
  assert.ok(typeof safe.consumedAt === 'string');

  const restored = NutritionLog.fromFirestore(fs, fs.id);
  assert.equal(restored.totalCalories, 622);

  assert.throws(() => new NutritionLog({}), TypeError, 'requires ownerUid');
});

test('nutrition-service: WaterLog with unit conversions', () => {
  const { WaterLog } = require('../../apps/nutrition-service/src/models');

  const ml = new WaterLog({ ownerUid: 'u1', amount: 480, unit: 'ml' });
  assert.equal(ml.unit, 'ml');
  assert.equal(ml.amountInCups, 2);
  assert.equal(ml.amountInMl, 480);

  const cup = new WaterLog({ ownerUid: 'u1', amount: 2, unit: 'cups' });
  assert.equal(cup.amountInCups, 2);
  assert.equal(cup.amountInMl, 480);

  const litre = new WaterLog({ ownerUid: 'u1', amount: 1, unit: 'liters' });
  assert.ok(litre.amountInCups > 4, 'litre should be > 4 cups');
  assert.ok(litre.amountInMl === 1000);

  const safe = cup.toSafeJSON();
  assert.ok(typeof safe.loggedAt === 'string');

  const restored = WaterLog.fromFirestore(cup.toFirestore(), cup.id);
  assert.equal(restored.amountInCups, 2);

  assert.throws(() => new WaterLog({}), TypeError, 'requires ownerUid');
  assert.throws(() => new WaterLog({ ownerUid: 'u1', amount: -1 }), TypeError, 'amount must be > 0');
});

test('nutrition-service: SleepLog with calorie estimate', () => {
  const { SleepLog } = require('../../apps/nutrition-service/src/models');

  const log = new SleepLog({
    ownerUid: 'u1',
    sleepHours: 7.5,
    quality: 'good',
    bedtime: '2026-10-26T23:00:00Z',
    wakeTime: '2026-10-27T06:30:00Z',
    notes: 'Slept after battle'
  });

  assert.equal(log.sleepHours, 7.5);
  assert.equal(log.quality, 'good');
  assert.ok(log.sleepCalories > 0, 'sleep calories should be estimated');
  assert.equal(log.notes, 'Slept after battle');

  // Static estimator
  const cals = SleepLog.estimateSleepCalories(8, 70);
  assert.ok(cals > 0);

  const fs = log.toFirestore();
  assert.equal(fs.sleepHours, 7.5);

  const restored = SleepLog.fromFirestore(fs, fs.id);
  assert.equal(restored.sleepHours, 7.5);

  assert.throws(() => new SleepLog({}), TypeError, 'requires ownerUid');
  assert.throws(() => new SleepLog({ ownerUid: 'u1', sleepHours: 25 }), TypeError, 'hours > 24 invalid');
});

test('nutrition-service: DailyLog aggregate with netCalories', () => {
  const { DailyLog } = require('../../apps/nutrition-service/src/models');

  const today = new Date();
  const log = new DailyLog({
    ownerUid: 'u1',
    date: today,
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 70,
    waterIntake: 8,
    sleepHours: 7,
    exerciseMinutes: 45,
    exerciseCalories: 400,
    weight: 75.5
  });

  assert.equal(log.ownerUid, 'u1');
  assert.equal(log.calories, 2000);
  assert.equal(log.waterIntake, 8);
  assert.equal(log.sleepHours, 7);
  assert.ok(log.sleepCalories > 0, 'sleep calories should be auto-estimated');
  assert.ok(log.netCalories < log.calories, 'net should be less than gross');
  assert.equal(log.weight, 75.5);

  // Deterministic document ID
  const expectedId = DailyLog.buildDocumentId('u1', DailyLog.normaliseDate(today));
  assert.equal(log.documentId, expectedId);

  const fs = log.toFirestore();
  assert.ok(typeof fs.date === 'string', 'date should be ISO string in Firestore payload');

  const safe = log.toSafeJSON();
  assert.ok('netCalories' in safe, 'netCalories should be in safe JSON');

  const restored = DailyLog.fromFirestore(fs);
  assert.equal(restored.ownerUid, 'u1');
  assert.equal(restored.weight, 75.5);

  assert.throws(() => new DailyLog({}), TypeError, 'requires ownerUid');
  assert.throws(() => new DailyLog({ ownerUid: 'u1', date: 'not-a-date' }), TypeError, 'invalid date should throw');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. recipe-service
// ─────────────────────────────────────────────────────────────────────────────
test('recipe-service: Recipe model', () => {
  const { Recipe } = require('../../apps/recipe-service/src/models');
  const recipe = new Recipe({ title: 'Viking Broth', instructions: ['Simmer bones'] });
  assert.equal(recipe.title, 'Viking Broth');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. community-service
// ─────────────────────────────────────────────────────────────────────────────
test('community-service: Community, CommunityMember, Post, Comment', () => {
  const { Community, CommunityMember, Post, Comment } = require('../../apps/community-service/src/models');
  const comm   = new Community({ name: 'Berserkers', ownerUid: 'u1' });
  const member = new CommunityMember({ communityId: comm.id, uid: 'u2' });
  const post   = new Post({ communityId: comm.id, authorUid: 'u1', text: 'Battle ready.' });
  const comment = new Comment({ postId: post.id, authorUid: 'u2', text: 'Aye!' });
  assert.equal(comm.name, 'Berserkers');
  assert.equal(member.role, 'member');
  assert.equal(post.text, 'Battle ready.');
  assert.equal(comment.text, 'Aye!');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. messaging-service
// ─────────────────────────────────────────────────────────────────────────────
test('messaging-service: Conversation, Message', () => {
  const { Conversation, Message } = require('../../apps/messaging-service/src/models');
  const conv = new Conversation({ participantUids: ['u1', 'u2'] });
  const msg  = new Message({ conversationId: conv.id, senderUid: 'u1', body: 'Skol!' });
  assert.equal(conv.participantUids.length, 2);
  assert.equal(msg.body, 'Skol!');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. notification-service
// ─────────────────────────────────────────────────────────────────────────────
test('notification-service: Notification model', () => {
  const { Notification } = require('../../apps/notification-service/src/models');
  const notif = new Notification({ recipientUid: 'u1', title: 'Workout ready', body: 'Time to train' });
  assert.equal(notif.isRead(), false);
  notif.markAsRead();
  assert.equal(notif.isRead(), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Cross-model: DailyLog document ID stability
// ─────────────────────────────────────────────────────────────────────────────
test('DailyLog: deterministic document ID is stable across timezones', () => {
  const { DailyLog } = require('../../apps/nutrition-service/src/models');
  const a = new DailyLog({ ownerUid: 'u1', date: '2026-10-27T00:00:00Z' });
  const b = new DailyLog({ ownerUid: 'u1', date: '2026-10-27T23:59:59+05:30' });
  // Both should land on 2026-10-27 in UTC
  assert.equal(a.documentId, b.documentId);
});
