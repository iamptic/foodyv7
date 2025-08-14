import os, asyncio, asyncpg, datetime as dt

DB_URL = os.getenv("DATABASE_URL")

DDL = [
    """
    CREATE TABLE IF NOT EXISTS foody_restaurants (
        restaurant_id TEXT PRIMARY KEY,
        api_key TEXT NOT NULL,
        name TEXT,
        phone TEXT,
        address TEXT,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        close_time TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS foody_offers (
        id BIGSERIAL PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        original_price_cents INTEGER,
        qty_total INTEGER NOT NULL,
        qty_left INTEGER NOT NULL,
        expires_at TIMESTAMPTZ,
        image_url TEXT,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_offers_restaurant ON foody_offers(restaurant_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_offers_expires ON foody_offers(expires_at);
    """,
    """
    CREATE TABLE IF NOT EXISTS foody_redeems (
        id BIGSERIAL PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        offer_id BIGINT,
        code TEXT UNIQUE,
        amount_cents INTEGER DEFAULT 0,
        redeemed_at TIMESTAMPTZ DEFAULT NOW()
    );
    """
]

async def run():
    pool = await asyncpg.create_pool(DB_URL, min_size=1, max_size=4)
    async with pool.acquire() as conn:
        for q in DDL:
            await conn.execute(q)

        rid = 'RID_TEST'
        key = 'KEY_TEST'
        row = await conn.fetchrow('SELECT 1 FROM foody_restaurants WHERE restaurant_id=$1', rid)
        if not row:
            await conn.execute('INSERT INTO foody_restaurants (restaurant_id, api_key, name, phone) VALUES ($1,$2,$3,$4)',
                               rid, key, 'Demo Cafe', '+7 999 000-00-00')
            now = dt.datetime.utcnow()
            offers = [
                ('Сет эклеров', 19900, 34900, 5, 5, now + dt.timedelta(hours=6)),
                ('Пицца маргарита', 29900, 49900, 3, 3, now + dt.timedelta(hours=4)),
                ('Набор суши', 39900, 59900, 4, 4, now + dt.timedelta(hours=5)),
            ]
            for t, p, o, qt, ql, exp in offers:
                await conn.execute('''
                    INSERT INTO foody_offers (restaurant_id,title,price_cents,original_price_cents,qty_total,qty_left,expires_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                ''', rid, t, p, o, qt, ql, exp)
    await pool.close()

def ensure():
    if os.getenv("RUN_MIGRATIONS", "0").lower() not in ("1","true","yes","on"):
        print("BOOTSTRAP: RUN_MIGRATIONS disabled")
        return
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            return loop.create_task(run())
        else:
            loop.run_until_complete(run())
    except RuntimeError:
        asyncio.run(run())
