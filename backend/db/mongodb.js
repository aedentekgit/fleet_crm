import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB_NAME || process.env.DB_NAME || 'renserp';

let client = null;
let db = null;

export async function connectDb() {
  if (db) return db;
  if (!client) {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
  }
  await client.connect();
  db = client.db(dbName);
  return db;
}

export async function getDb() {
  if (!db) {
    await connectDb();
  }
  return db;
}

export async function getClient() {
  if (!client) {
    await connectDb();
  }
  return client;
}

export default { connectDb, getDb, getClient };
