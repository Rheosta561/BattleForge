'use strict';

const crypto = require('crypto');

const MESSAGE_TYPES = Object.freeze(['text', 'mediaReference']);

class Message {
  constructor ({
    id = crypto.randomUUID(),
    conversationId,
    senderUid,
    body,
    messageType = 'text',
    createdAt = new Date()
  } = {}) {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new TypeError('Message requires a valid conversationId');
    }
    if (!senderUid || typeof senderUid !== 'string') {
      throw new TypeError('Message requires a valid senderUid');
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
      throw new TypeError('Message requires non-empty body');
    }

    this.id = id;
    this.conversationId = conversationId;
    this.senderUid = senderUid.trim();
    this.body = body.trim().slice(0, 4000);
    this.messageType = MESSAGE_TYPES.includes(messageType) ? messageType : 'text';
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  toFirestore () {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderUid: this.senderUid,
      body: this.body,
      messageType: this.messageType,
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

    return new Message({
      id: id || data.id,
      conversationId: data.conversationId,
      senderUid: data.senderUid,
      body: data.body,
      messageType: data.messageType,
      createdAt: toDate(data.createdAt)
    });
  }
}

class Conversation {
  constructor ({
    id = crypto.randomUUID(),
    participantUids = [],
    lastMessageAt = new Date(),
    createdAt = new Date()
  } = {}) {
    if (!Array.isArray(participantUids) || participantUids.length < 2) {
      throw new TypeError('Conversation requires at least two participantUids');
    }

    this.id = id;
    this.participantUids = participantUids.map(u => String(u).trim()).slice(0, 50);
    this.lastMessageAt = lastMessageAt instanceof Date ? lastMessageAt : new Date(lastMessageAt);
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  toFirestore () {
    return {
      id: this.id,
      participantUids: this.participantUids,
      lastMessageAt: this.lastMessageAt,
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

    return new Conversation({
      id: id || data.id,
      participantUids: data.participantUids,
      lastMessageAt: toDate(data.lastMessageAt),
      createdAt: toDate(data.createdAt)
    });
  }
}

Conversation.MESSAGE_TYPES = MESSAGE_TYPES;
Conversation.Message = Message;

module.exports = { Conversation, Message };
