import mongoose from 'mongoose';
import HolidayPlan from '../src/models/HolidayPlan.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixIndexes() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI or MONGO_URI environment variable is required');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Step 1: Clean up any documents with userId: null (should use browserId instead)
    console.log('\nStep 1: Cleaning up documents with userId: null...');
    const nullUserPlans = await HolidayPlan.find({ userId: null });
    console.log(`Found ${nullUserPlans.length} plans with userId: null`);
    
    for (const plan of nullUserPlans) {
      if (!plan.browserId) {
        console.log(`Warning: Plan ${plan._id} has neither userId nor browserId - this should not happen`);
        // Generate a temporary browserId or delete the orphaned plan
        // For now, we'll skip it
        continue;
      }
      // Remove userId field entirely (set to undefined so Mongoose omits it)
      plan.userId = undefined;
      await plan.save();
      console.log(`Cleaned up plan ${plan._id}`);
    }

    // Step 2: Drop existing indexes
    console.log('\nStep 2: Dropping existing indexes...');
    try {
      await HolidayPlan.collection.dropIndex('userId_year_unique');
      console.log('Dropped userId_year_unique index');
    } catch (err) {
      if (err.codeName === 'IndexNotFound') {
        console.log('userId_year_unique index does not exist, skipping');
      } else {
        throw err;
      }
    }

    try {
      await HolidayPlan.collection.dropIndex('browserId_year_unique');
      console.log('Dropped browserId_year_unique index');
    } catch (err) {
      if (err.codeName === 'IndexNotFound') {
        console.log('browserId_year_unique index does not exist, skipping');
      } else {
        throw err;
      }
    }

    // Step 3: Recreate indexes with sparse flag
    console.log('\nStep 3: Recreating indexes with sparse flag...');
    await HolidayPlan.collection.createIndex(
      { userId: 1, year: 1 },
      {
        unique: true,
        sparse: true,
        name: 'userId_year_unique',
        partialFilterExpression: { userId: { $exists: true, $ne: null } }
      }
    );
    console.log('Created userId_year_unique index (sparse)');

    await HolidayPlan.collection.createIndex(
      { browserId: 1, year: 1 },
      {
        unique: true,
        sparse: true,
        name: 'browserId_year_unique',
        partialFilterExpression: { browserId: { $exists: true, $ne: null } }
      }
    );
    console.log('Created browserId_year_unique index (sparse)');

    console.log('\n✅ Migration complete!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error during migration:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixIndexes();

