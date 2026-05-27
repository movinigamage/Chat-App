const { parsePhoneInput } = require("./phone");

/**
 * Find a user by E.164 phone, including legacy rows stored in other formats
 * that normalize to the same number.
 */
async function findUserByPhone(User, phoneE164) {
  const direct = await User.findOne({ phone: phoneE164 }).lean();
  if (direct) return direct;

  const others = await User.find({ phone: { $ne: phoneE164 } }).select("phone name").lean();
  for (const user of others) {
    const parsed = parsePhoneInput(user.phone);
    if (parsed.ok && parsed.phone === phoneE164) {
      return user;
    }
  }
  return null;
}

/**
 * On startup, store all phones in E.164 so the same number cannot exist twice
 * under different string formats.
 */
async function migrateUserPhonesToE164(User) {
  const users = await User.find({}).select("phone").lean();
  const canonicalByE164 = new Map();

  for (const user of users) {
    const parsed = parsePhoneInput(user.phone);
    if (!parsed.ok) {
      console.warn(`Skipping invalid stored phone for user ${user._id}: ${user.phone}`);
      continue;
    }

    if (user.phone === parsed.phone) {
      if (canonicalByE164.has(parsed.phone)) {
        console.warn(
          `Duplicate account for ${parsed.phone} (ids: ${canonicalByE164.get(parsed.phone)}, ${user._id}). ` +
            "Remove duplicates manually in MongoDB."
        );
      } else {
        canonicalByE164.set(parsed.phone, user._id);
      }
      continue;
    }

    if (canonicalByE164.has(parsed.phone)) {
      console.warn(
        `Cannot normalize ${user.phone} -> ${parsed.phone}; account already exists (${canonicalByE164.get(parsed.phone)}).`
      );
      continue;
    }

    try {
      await User.updateOne({ _id: user._id }, { $set: { phone: parsed.phone } });
      canonicalByE164.set(parsed.phone, user._id);
      console.log(`Normalized phone ${user.phone} -> ${parsed.phone}`);
    } catch (error) {
      if (error.code === 11000) {
        console.warn(
          `Cannot normalize ${user.phone} -> ${parsed.phone}; duplicate key (user ${user._id}).`
        );
      } else {
        throw error;
      }
    }
  }
}

module.exports = {
  findUserByPhone,
  migrateUserPhonesToE164
};
