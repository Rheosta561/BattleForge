'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('all microservices export and instantiate their respective domain models', () => {
  // 1. user-service
  const { User } = require('../../apps/user-service/src/models');
  const user = new User({ uid: 'u1', email: 'test@lagertha.dev' });
  assert.equal(user.uid, 'u1');

  // 2. workout-service
  const { WorkoutPlan, WorkoutLog, ExerciseSet } = require('../../apps/workout-service/src/models');
  const plan = new WorkoutPlan({ ownerUid: 'u1', title: 'Shield Wall Routine' });
  const log = new WorkoutLog({ ownerUid: 'u1', planId: plan.id });
  const set = new ExerciseSet({ exerciseId: 'deadlift', reps: 5, weight: 140 });
  assert.equal(plan.title, 'Shield Wall Routine');
  assert.equal(log.status, 'inProgress');
  assert.equal(set.weight, 140);

  // 3. nutrition-service
  const { NutritionLog } = require('../../apps/nutrition-service/src/models');
  const nLog = new NutritionLog({
    ownerUid: 'u1',
    mealType: 'dinner',
    items: [{ foodId: 'salmon', name: 'Wild Salmon', calories: 400, proteinGrams: 40 }]
  });
  assert.equal(nLog.totalCalories, 400);

  // 4. recipe-service
  const { Recipe } = require('../../apps/recipe-service/src/models');
  const recipe = new Recipe({ title: 'Viking Broth', instructions: ['Simmer bones'] });
  assert.equal(recipe.title, 'Viking Broth');

  // 5. community-service
  const { Community, CommunityMember, Post, Comment } = require('../../apps/community-service/src/models');
  const comm = new Community({ name: 'Berserkers', ownerUid: 'u1' });
  const member = new CommunityMember({ communityId: comm.id, uid: 'u2' });
  const post = new Post({ communityId: comm.id, authorUid: 'u1', text: 'Battle ready.' });
  const comment = new Comment({ postId: post.id, authorUid: 'u2', text: 'Aye!' });
  assert.equal(comm.name, 'Berserkers');
  assert.equal(member.role, 'member');
  assert.equal(post.text, 'Battle ready.');
  assert.equal(comment.text, 'Aye!');

  // 6. messaging-service
  const { Conversation, Message } = require('../../apps/messaging-service/src/models');
  const conv = new Conversation({ participantUids: ['u1', 'u2'] });
  const msg = new Message({ conversationId: conv.id, senderUid: 'u1', body: 'Skol!' });
  assert.equal(conv.participantUids.length, 2);
  assert.equal(msg.body, 'Skol!');

  // 7. notification-service
  const { Notification } = require('../../apps/notification-service/src/models');
  const notif = new Notification({ recipientUid: 'u1', title: 'Workout ready', body: 'Time to train' });
  assert.equal(notif.isRead(), false);
  notif.markAsRead();
  assert.equal(notif.isRead(), true);
});
