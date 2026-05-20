import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const userSchema = new mongoose.Schema(
  {
    /** Firebase Auth UID — unique when present (end-user / linked accounts) */
    firebaseUid: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    /** Legacy email/password (admin panels). Omitted for Firebase-only users. */
    password: { type: String, select: false },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'BUSINESS_OWNER', 'USER'],
      default: 'USER',
    },
    phone: { type: String, default: '' },
    /** Profile image URL (e.g. Google picture) */
    photoURL: { type: String, default: '' },
    savedBusinesses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Business' }],
    recentlyViewed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Business' }],
    refreshTokens: { type: [refreshTokenSchema], default: [] },
    ownedBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
    },
    /** Super admin can suspend marketplace access for this business owner (owner APIs + login). */
    isBlocked: { type: Boolean, default: false },
    /**
     * Optional platform subscription end for SUPER_ADMIN (or future org billing).
     * When set and in the past, admin-super shows a renewal banner.
     */
    subscriptionExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
)

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next()
  if (!this.password || String(this.password).length < 8) {
    this.password = undefined
    return next()
  }
  const salt = await bcrypt.genSalt(12)
  this.password = await bcrypt.hash(this.password, salt)
  next()
})

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return false
  return bcrypt.compare(candidate, this.password)
}

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    phone: this.phone,
    photoURL: this.photoURL || '',
    firebaseUid: this.firebaseUid || null,
    savedBusinesses: this.savedBusinesses,
    recentlyViewed: this.recentlyViewed || [],
    ownedBusinessId: this.ownedBusinessId,
    isBlocked: this.isBlocked,
    subscriptionExpiresAt: this.subscriptionExpiresAt || null,
    createdAt: this.createdAt,
  }
}

export const User = mongoose.models.User || mongoose.model('User', userSchema)
