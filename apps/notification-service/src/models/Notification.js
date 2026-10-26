'use strict';

const crypto = require('crypto');

const NOTIFICATION_TYPES = Object.freeze([
  'system',
  'workout_reminder',
  'social',
  'achievement'
]);

class Notification {
  constructor ({
    id = crypto.randomUUID(),
    recipientUid,
    type = 'system',
    title,
    body,
    readAt = null,
    resourceType = null,
    resourceId = null,
    createdAt = new Date()
  } = {}) {
    if (!recipientUid || typeof recipientUid !== 'string' || !recipientUid.trim()) {
      throw new TypeError('Notification requires a valid recipientUid');
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new TypeError('Notification requires a non-empty title');
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new TypeError('Notification requires a non-empty body');
    }

    this.id = id;
    this.recipientUid = recipientUid.trim();
    this.type = NOTIFICATION_TYPES.includes(type) ? type : 'system';
    this.title = title.trim().slice(0, 150);
    this.body = body.trim().slice(0, 1000);
    this.readAt = readAt ? (readAt instanceof Date ? readAt : new Date(readAt)) : null;
    this.resourceType = resourceType && typeof resourceType === 'string' ? resourceType : null;
    this.resourceId = resourceId && typeof resourceId === 'string' ? resourceId : null;
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  isRead () {
    return this.readAt !== null;
  }

  markAsRead (readTime = new Date()) {
    this.readAt = readTime instanceof Date ? readTime : new Date(readTime);
  }

  toFirestore () {
    return {
      id: this.id,
      recipientUid: this.recipientUid,
      type: this.type,
      title: this.title,
      body: this.body,
      readAt: this.readAt,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
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

    return new Notification({
      id: id || data.id,
      recipientUid: data.recipientUid,
      type: data.type,
      title: data.title,
      body: data.body,
      readAt: toDate(data.readAt),
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      createdAt: toDate(data.createdAt) || new Date()
    });
  }
}

Notification.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

module.exports = Notification;
