'use strict';

const crypto = require('crypto');

class Comment {
  constructor ({
    id = crypto.randomUUID(),
    postId,
    authorUid,
    text,
    createdAt = new Date()
  } = {}) {
    if (!postId || typeof postId !== 'string') {
      throw new TypeError('Comment requires a valid postId');
    }
    if (!authorUid || typeof authorUid !== 'string') {
      throw new TypeError('Comment requires a valid authorUid');
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new TypeError('Comment requires non-empty text');
    }

    this.id = id;
    this.postId = postId;
    this.authorUid = authorUid.trim();
    this.text = text.trim().slice(0, 500);
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  toFirestore () {
    return {
      id: this.id,
      postId: this.postId,
      authorUid: this.authorUid,
      text: this.text,
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

    return new Comment({
      id: id || data.id,
      postId: data.postId,
      authorUid: data.authorUid,
      text: data.text,
      createdAt: toDate(data.createdAt)
    });
  }
}

class Post {
  constructor ({
    id = crypto.randomUUID(),
    communityId,
    authorUid,
    text,
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!communityId || typeof communityId !== 'string') {
      throw new TypeError('Post requires a valid communityId');
    }
    if (!authorUid || typeof authorUid !== 'string') {
      throw new TypeError('Post requires a valid authorUid');
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new TypeError('Post requires non-empty text');
    }

    this.id = id;
    this.communityId = communityId;
    this.authorUid = authorUid.trim();
    this.text = text.trim().slice(0, 2000);
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  toFirestore () {
    return {
      id: this.id,
      communityId: this.communityId,
      authorUid: this.authorUid,
      text: this.text,
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

    return new Post({
      id: id || data.id,
      communityId: data.communityId,
      authorUid: data.authorUid,
      text: data.text,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    });
  }
}

Post.Comment = Comment;

module.exports = { Post, Comment };
