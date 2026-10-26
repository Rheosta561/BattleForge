'use strict';

const crypto = require('crypto');

const MEMBER_ROLES = Object.freeze(['member', 'moderator', 'owner']);

class CommunityMember {
  constructor ({
    id = null,
    communityId,
    uid,
    role = 'member',
    joinedAt = new Date()
  } = {}) {
    if (!communityId || typeof communityId !== 'string') {
      throw new TypeError('CommunityMember requires a valid communityId');
    }
    if (!uid || typeof uid !== 'string') {
      throw new TypeError('CommunityMember requires a valid uid');
    }

    this.id = id || `${communityId}_${uid}`;
    this.communityId = communityId;
    this.uid = uid;
    this.role = MEMBER_ROLES.includes(role) ? role : 'member';
    this.joinedAt = joinedAt instanceof Date ? joinedAt : new Date(joinedAt);
  }

  toFirestore () {
    return {
      id: this.id,
      communityId: this.communityId,
      uid: this.uid,
      role: this.role,
      joinedAt: this.joinedAt
    };
  }

  static fromFirestore (data, id) {
    if (!data) return null;
    const toDate = val => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    return new CommunityMember({
      id: id || data.id,
      communityId: data.communityId,
      uid: data.uid,
      role: data.role,
      joinedAt: toDate(data.joinedAt)
    });
  }
}

class Community {
  constructor ({
    id = crypto.randomUUID(),
    name,
    description = null,
    ownerUid,
    createdAt = new Date()
  } = {}) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new TypeError('Community requires a non-empty name');
    }
    if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
      throw new TypeError('Community requires a valid ownerUid');
    }

    this.id = id;
    this.name = name.trim().slice(0, 100);
    this.description = description && typeof description === 'string' ? description.trim().slice(0, 500) : null;
    this.ownerUid = ownerUid.trim();
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  }

  toFirestore () {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      ownerUid: this.ownerUid,
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

    return new Community({
      id: id || data.id,
      name: data.name,
      description: data.description,
      ownerUid: data.ownerUid,
      createdAt: toDate(data.createdAt)
    });
  }
}

Community.MEMBER_ROLES = MEMBER_ROLES;
Community.CommunityMember = CommunityMember;

module.exports = { Community, CommunityMember };
