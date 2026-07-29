import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    email: String,

    phone: String,

    otp: String,

    password: String,

    expiresAt: Date,
  },
  {
    timestamps: true,
  }
);

otpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export default mongoose.model(
  'Otp',
  otpSchema
);
