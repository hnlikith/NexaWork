/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const MONGODB_URI = process.env.MONGODB_URI!;

async function clear() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB Atlas");

  const collections = await mongoose.connection.db!.listCollections().toArray();
  for (const col of collections) {
    await mongoose.connection.db!.collection(col.name).deleteMany({});
    console.log(`Cleared: ${col.name}`);
  }

  console.log("\n✅ All data cleared. Database is empty.");
  await mongoose.disconnect();
}

clear().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
