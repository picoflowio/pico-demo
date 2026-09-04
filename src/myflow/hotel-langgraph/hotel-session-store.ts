import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";
import { MongoClient, type Collection } from "mongodb";
import type { HotelLanggraphStateType } from "./hotel-langgraph.state.js";

type StoredHotelLanggraphState = Omit<
  HotelLanggraphStateType,
  "exploreMessages" | "presentMessages" | "compareMessages"
> & {
  exploreMessages: StoredMessage[];
  presentMessages: StoredMessage[];
  compareMessages: StoredMessage[];
};

export type HotelSessionDocument = {
  version: 1;
  id: string;
  graphName: "HotelLanggraph";
  state: StoredHotelLanggraphState;
  createdAt: string;
  modifiedAt: string;
  expireAfter: number;
};

export interface HotelSessionStore {
  readonly kind: "memory" | "sqlite" | "mongodb";
  get(id: string): Promise<HotelSessionDocument | undefined>;
  set(document: HotelSessionDocument): Promise<void>;
  delete(id: string): Promise<void>;
  close(): Promise<void>;
}

export class MemoryHotelSessionStore implements HotelSessionStore {
  readonly kind = "memory";
  private readonly documents = new Map<string, HotelSessionDocument>();

  /**
   * Retrieves a stored session document by ID from memory.
   *
   * @param id - Session identifier string.
   * @returns Stored session document or undefined if not present.
   */
  async get(id: string): Promise<HotelSessionDocument | undefined> {
    return this.documents.get(id);
  }

  /**
   * Persists a session document to the in-memory map.
   *
   * @param document - Session document to store.
   */
  async set(document: HotelSessionDocument): Promise<void> {
    this.documents.set(document.id, document);
  }

  /**
   * Removes a session document from memory.
   *
   * @param id - Session identifier to remove.
   */
  async delete(id: string): Promise<void> {
    this.documents.delete(id);
  }

  /**
   * Closes in-memory storage (no-op).
   */
  async close(): Promise<void> {}
}

class SqliteHotelSessionStore implements HotelSessionStore {
  readonly kind = "sqlite";
  private readonly database: DatabaseSync;
  private closed = false;

  /**
   * Opens or creates an SQLite database file and initializes the session schema.
   *
   * @param databasePath - Path to SQLite database file or ':memory:'.
   */
  constructor(databasePath: string) {
    const resolved =
      databasePath === ":memory:" ? databasePath : resolve(databasePath);
    if (resolved !== ":memory:") mkdirSync(dirname(resolved), { recursive: true });
    this.database = new DatabaseSync(resolved);
    this.database.exec("PRAGMA busy_timeout = 5000");
    if (resolved !== ":memory:") this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS hotel_langgraph_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        document TEXT NOT NULL,
        modified_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Loads and deserializes a session document from SQLite.
   *
   * @param id - Session identifier.
   * @returns Parsed session document or undefined if not found.
   */
  async get(id: string): Promise<HotelSessionDocument | undefined> {
    const row = this.database
      .prepare(
        "SELECT document FROM hotel_langgraph_sessions WHERE id = ?",
      )
      .get(id) as { document: string } | undefined;
    return row
      ? (JSON.parse(row.document) as HotelSessionDocument)
      : undefined;
  }

  /**
   * Upserts a session document JSON into the SQLite sessions table.
   *
   * @param document - Session document to persist.
   */
  async set(document: HotelSessionDocument): Promise<void> {
    this.database
      .prepare(`
        INSERT INTO hotel_langgraph_sessions (id, document, modified_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          document = excluded.document,
          modified_at = excluded.modified_at
      `)
      .run(document.id, JSON.stringify(document), document.modifiedAt);
  }

  /**
   * Deletes a session row by ID from SQLite.
   *
   * @param id - Session identifier to remove.
   */
  async delete(id: string): Promise<void> {
    this.database
      .prepare("DELETE FROM hotel_langgraph_sessions WHERE id = ?")
      .run(id);
  }

  /**
   * Closes the SQLite database handle safely.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}

class MongoHotelSessionStore implements HotelSessionStore {
  readonly kind = "mongodb";

  private constructor(
    private readonly client: MongoClient,
    private readonly collection: Collection<HotelSessionDocument>,
  ) {}

  /**
   * Connects to a MongoDB instance, creates unique indexes, and initializes the store.
   *
   * @param url - MongoDB connection string.
   * @param databaseName - Target database name.
   * @param collectionName - Collection name for session records.
   * @returns Initialized MongoHotelSessionStore instance.
   */
  static async create(
    url: string,
    databaseName: string,
    collectionName: string,
  ): Promise<MongoHotelSessionStore> {
    const client = new MongoClient(url);
    await client.connect();
    const collection = client
      .db(databaseName)
      .collection<HotelSessionDocument>(collectionName);
    await collection.createIndex({ id: 1 }, { unique: true });
    return new MongoHotelSessionStore(client, collection);
  }

  /**
   * Finds a session document by ID in the MongoDB collection.
   *
   * @param id - Session identifier.
   * @returns Session document or undefined if missing.
   */
  async get(id: string): Promise<HotelSessionDocument | undefined> {
    return (await this.collection.findOne({ id })) ?? undefined;
  }

  /**
   * Replaces or inserts a session document in MongoDB.
   *
   * @param document - Session document to persist.
   */
  async set(document: HotelSessionDocument): Promise<void> {
    await this.collection.replaceOne(
      { id: document.id },
      document,
      { upsert: true },
    );
  }

  /**
   * Deletes a session document matching the given ID from MongoDB.
   *
   * @param id - Session identifier to delete.
   */
  async delete(id: string): Promise<void> {
    await this.collection.deleteOne({ id });
  }

  /**
   * Disconnects the MongoDB client.
   */
  async close(): Promise<void> {
    await this.client.close();
  }
}

/**
 * Factory creating a MongoDB-backed hotel session store instance.
 *
 * @param options - Connection options (URL, database, collection).
 * @returns Initialized HotelSessionStore.
 */
export async function createMongoHotelSessionStore(options: {
  url: string;
  databaseName: string;
  collectionName: string;
}): Promise<HotelSessionStore> {
  return MongoHotelSessionStore.create(
    options.url,
    options.databaseName,
    options.collectionName,
  );
}

/**
 * Creates the appropriate session store instance based on the `SESSION_STORE` environment variable
 * ('memory', 'sqlite', or 'mongodb').
 *
 * @returns Initialized HotelSessionStore implementation.
 */
export async function createHotelSessionStoreFromEnvironment(): Promise<HotelSessionStore> {
  const kind = (process.env.SESSION_STORE ?? "memory").trim().toLowerCase();
  if (kind === "memory") return new MemoryHotelSessionStore();
  if (kind === "sqlite") {
    return new SqliteHotelSessionStore(
      process.env.SQLITE_DB_PATH?.trim() || "./data/sessions.sqlite",
    );
  }
  if (kind === "mongodb" || kind === "mongo") {
    const url = process.env.MONGODB_URL?.trim();
    const databaseName = process.env.MONGODB_NAME?.trim();
    const collectionName = process.env.MONGODB_COLLECTION?.trim();
    if (!url || !databaseName || !collectionName) {
      throw new Error(
        "MongoDB session persistence requires MONGODB_URL, MONGODB_NAME, and MONGODB_COLLECTION.",
      );
    }
    return createMongoHotelSessionStore({
      url,
      databaseName,
      collectionName,
    });
  }
  throw new Error(
    `HotelLanggraph does not support SESSION_STORE '${kind}'. Use memory, sqlite, or mongodb.`,
  );
}

/**
 * Converts live LangChain chat messages in graph state into serializable StoredMessage objects.
 *
 * @param state - Live HotelLanggraph state.
 * @returns Serializable state object.
 */
export function serializeHotelState(
  state: HotelLanggraphStateType,
): StoredHotelLanggraphState {
  return {
    ...state,
    exploreMessages: mapChatMessagesToStoredMessages(state.exploreMessages),
    presentMessages: mapChatMessagesToStoredMessages(state.presentMessages),
    compareMessages: mapChatMessagesToStoredMessages(state.compareMessages),
  };
}

/**
 * Rehydrates serialized StoredMessage objects back into live LangChain chat message instances.
 *
 * @param state - Stored state object.
 * @returns Hydrated HotelLanggraphStateType.
 */
export function hydrateHotelState(
  state: StoredHotelLanggraphState,
): HotelLanggraphStateType {
  return {
    ...state,
    exploreMessages: mapStoredMessagesToChatMessages(state.exploreMessages),
    presentMessages: mapStoredMessagesToChatMessages(state.presentMessages),
    compareMessages: mapStoredMessagesToChatMessages(state.compareMessages),
  };
}
