import os, asyncio, asyncpg

DB_URL = os.getenv("DATABASE_URL")

async def _ensure(conn: asyncpg.Connection):
    # --- foody_restaurants ---
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS foody_restaurants (
            restaurant_id TEXT,
            api_key       TEXT,
            name          TEXT,
            phone         TEXT,
            address       TEXT,
            lat           DOUBLE PRECISION,
            lng           DOUBLE PRECISION,
            close_time    TEXT,
            created_at    TIMESTAMPTZ DEFAULT now()
        );
    """)
    # columns (idempotent)
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS restaurant_id TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS api_key TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS name TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS phone TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS address TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS close_time TEXT;")
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();")
    # optional legacy title must be nullable
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS title TEXT;")
    await conn.execute(r"""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='foody_restaurants' AND column_name='title' AND is_nullable='NO'
      ) THEN
        ALTER TABLE foody_restaurants ALTER COLUMN title DROP NOT NULL;
      END IF;
    END $$;
    """)

    # --- ensure numeric `id` column and sequence (works even if existing id is TEXT) ---
    await conn.execute("ALTER TABLE foody_restaurants ADD COLUMN IF NOT EXISTS id BIGINT;")
    await conn.execute(r"""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relkind='S' AND relname='foody_restaurants_id_seq'
          ) THEN
            CREATE SEQUENCE foody_restaurants_id_seq;
            ALTER SEQUENCE foody_restaurants_id_seq OWNED BY foody_restaurants.id;
          END IF;
        END $$;
    """)
    await conn.execute("ALTER TABLE foody_restaurants ALTER COLUMN id SET DEFAULT nextval('foody_restaurants_id_seq');")

    # sync sequence safely regardless of id type
    await conn.execute(r"""
        DO $$
        DECLARE
          v_typ text;
          v_max bigint;
        BEGIN
          SELECT data_type INTO v_typ
          FROM information_schema.columns
          WHERE table_name='foody_restaurants' AND column_name='id' AND table_schema='public';

          IF v_typ IN ('integer','bigint','smallint') THEN
            EXECUTE 'SELECT COALESCE(MAX(id),0) FROM public.foody_restaurants' INTO v_max;
          ELSE
            EXECUTE $$
              SELECT COALESCE(MAX(CASE WHEN id ~ '^\d+$' THEN id::bigint ELSE NULL END),0)
              FROM public.foody_restaurants
            $$ INTO v_max;
          END IF;

          PERFORM setval('foody_restaurants_id_seq', v_max);
        END $$;
    """)

    # backfill null ids
    await conn.execute("UPDATE foody_restaurants SET id = nextval('foody_restaurants_id_seq') WHERE id IS NULL;")
    await conn.execute("ALTER TABLE foody_restaurants ALTER COLUMN id SET NOT NULL;")

    # business key on restaurant_id
    await conn.execute(r"""
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
            id                   BIGSERIAL PRIMARY KEY,
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
    # normalize offers types/defaults
    await conn.execute(r"""
        DO $$
        DECLARE v_typ text;
        BEGIN
          SELECT data_type INTO v_typ FROM information_schema.columns
          WHERE table_schema='public' AND table_name='foody_offers' AND column_name='restaurant_id';
          IF v_typ IS NOT NULL AND v_typ <> 'text' THEN
            EXECUTE 'ALTER TABLE public.foody_offers ALTER COLUMN restaurant_id TYPE TEXT USING restaurant_id::text';
          END IF;
        END $$;
    """)
    await conn.execute("ALTER TABLE foody_offers ALTER COLUMN price_cents SET DEFAULT 0;")
    await conn.execute("ALTER TABLE foody_offers ALTER COLUMN qty_total SET DEFAULT 0;")
    await conn.execute("ALTER TABLE foody_offers ALTER COLUMN qty_left SET DEFAULT 0;")
    await conn.execute("ALTER TABLE foody_offers ALTER COLUMN status SET DEFAULT 'active';")
    await conn.execute("ALTER TABLE foody_offers ALTER COLUMN created_at SET DEFAULT now();")
    await conn.execute(r"""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='foody_offers_restaurant_idx') THEN
            CREATE INDEX foody_offers_restaurant_idx ON public.foody_offers(restaurant_id);
          END IF;
        END $$;
    """)

    # --- foody_redeems ---
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS foody_redeems (
            id            BIGSERIAL PRIMARY KEY,
            restaurant_id TEXT NOT NULL,
            offer_id      INTEGER,
            code          TEXT NOT NULL UNIQUE,
            amount_cents  INTEGER DEFAULT 0,
            redeemed_at   TIMESTAMPTZ DEFAULT now()
        );
    """)
    await conn.execute(r"""
        DO $$
        DECLARE v_typ2 text;
        BEGIN
          SELECT data_type INTO v_typ2 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='foody_redeems' AND column_name='restaurant_id';
          IF v_typ2 IS NOT NULL AND v_typ2 <> 'text' THEN
            EXECUTE 'ALTER TABLE public.foody_redeems ALTER COLUMN restaurant_id TYPE TEXT USING restaurant_id::text';
          END IF;
        END $$;
    """)
    await conn.execute(r"""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='foody_redeems_restaurant_idx') THEN
            CREATE INDEX foody_redeems_restaurant_idx ON public.foody_redeems(restaurant_id);
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
    if os.getenv("RUN_MIGRATIONS", "0").lower() not in ("1","true","yes","on"):
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
