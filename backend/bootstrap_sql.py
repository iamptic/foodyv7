
import os, asyncio, asyncpg

DB_URL = os.getenv("DATABASE_URL")

async def _ensure(conn: asyncpg.Connection):
    # --- foody_restaurants ---
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS foody_restaurants (
            restaurant_id TEXT PRIMARY KEY,
            api_key       TEXT NOT NULL,
            name          TEXT,
            phone         TEXT,
            address       TEXT,
            lat           DOUBLE PRECISION,
            lng           DOUBLE PRECISION,
            close_time    TEXT,
            created_at    TIMESTAMPTZ DEFAULT now()
        );
    """)
    # Columns (idempotent)
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS restaurant_id TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS api_key TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS name TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS phone TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS address TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS close_time TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();")
    # Backfill restaurant_id where NULL, then add unique index
    await conn.execute("""
        UPDATE foody_restaurants SET restaurant_id = 'RID_'||upper(substr(md5(random()::text),1,12))
        WHERE restaurant_id IS NULL;
    """)
    await conn.execute("""
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'foody_restaurants_rid_uidx'
          ) THEN
            CREATE UNIQUE INDEX foody_restaurants_rid_uidx ON foody_restaurants(restaurant_id);
          END IF;
        END $$;
    """)

    # --- foody_offers ---
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS foody_offers (
            id                   SERIAL PRIMARY KEY,
            restaurant_id        TEXT NOT NULL,
            title                TEXT,
            price_cents          INTEGER NOT NULL DEFAULT 0,
            original_price_cents INTEGER,
            qty_total            INTEGER DEFAULT 0,
            qty_left             INTEGER DEFAULT 0,
            expires_at           TIMESTAMPTZ,
            image_url            TEXT,
            description          TEXT,
            status               TEXT NOT NULL DEFAULT 'active',
            created_at           TIMESTAMPTZ DEFAULT now()
        );
    """)
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS restaurant_id TEXT;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS title TEXT;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS price_cents INTEGER DEFAULT 0;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS original_price_cents INTEGER;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS qty_total INTEGER DEFAULT 0;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS qty_left INTEGER DEFAULT 0;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS image_url TEXT;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS description TEXT;")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';")
    await conn.execute("ALTER TABLE foody_offers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();")
    await conn.execute("""
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'foody_offers_restaurant_idx'
          ) THEN
            CREATE INDEX foody_offers_restaurant_idx ON foody_offers(restaurant_id);
          END IF;
        END $$;
    """)

    # --- foody_redeems ---
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS foody_redeems (
            id            SERIAL PRIMARY KEY,
            restaurant_id TEXT NOT NULL,
            offer_id      INTEGER,
            code          TEXT NOT NULL UNIQUE,
            amount_cents  INTEGER DEFAULT 0,
            redeemed_at   TIMESTAMPTZ DEFAULT now()
        );
    """)
    await conn.execute("ALTER TABLE foody_redeems ADD COLUMN IF NOT EXISTS restaurant_id TEXT;")
    await conn.execute("ALTER TABLE foody_redeems ADD COLUMN IF NOT EXISTS offer_id INTEGER;")
    await conn.execute("ALTER TABLE foody_redeems ADD COLUMN IF NOT EXISTS code TEXT;")
    await conn.execute("ALTER TABLE foody_redeems ADD COLUMN IF NOT EXISTS amount_cents INTEGER DEFAULT 0;")
    await conn.execute("ALTER TABLE foody_redeems ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ DEFAULT now();")
    await conn.execute("""
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'foody_redeems_restaurant_idx'
          ) THEN
            CREATE INDEX foody_redeems_restaurant_idx ON foody_redeems(restaurant_id);
          END IF;
        END $$;
    """)

async def run():
    conn = await asyncpg.connect(DB_URL)
    try:
        await _ensure(conn)
    finally:
        await conn.close()

def ensure():
    if os.getenv("RUN_MIGRATIONS", "0").lower() not in ("1", "true", "yes", "on"):
        print("BOOTSTRAP: RUN_MIGRATIONS disabled")
        return
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(run())
        else:
            loop.run_until_complete(run())
    except RuntimeError:
        asyncio.run(run())
