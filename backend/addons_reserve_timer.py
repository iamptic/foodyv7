
import os, asyncio, secrets, datetime as dt
from typing import Optional

import asyncpg
from fastapi import FastAPI, Body, Header, HTTPException, Query

# ---- Config ----
TTL_MINUTES_DEFAULT = int(os.getenv("RESERVATION_TTL_MINUTES", "30"))
DISCOUNT_TICK_SECONDS = int(os.getenv("DISCOUNT_TICK_SECONDS", "60"))  # how often to recompute discounts
EXPIRE_TICK_SECONDS   = int(os.getenv("EXPIRE_TICK_SECONDS", "60"))    # how often to expire reservations

# thresholds in minutes to close_time -> discount
# Example: [(120, 0.30), (60, 0.50), (20, 0.70)]
DISCOUNT_STEPS = os.getenv("DISCOUNT_STEPS", "120:0.30,60:0.50,20:0.70")

def _parse_steps(raw: str):
    steps = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        mm, disc = part.split(":")
        steps.append((int(mm), float(disc)))
    # sort ascending by minutes to close (so smaller window -> higher priority)
    steps.sort()
    steps = list(reversed(steps))
    return steps

_STEPS = _parse_steps(DISCOUNT_STEPS)

def _parse_close_dt(close_time_text: Optional[str]) -> Optional[dt.datetime]:
    if not close_time_text:
        return None
    try:
        hh, mm = close_time_text.split(":")[:2]
        now = dt.datetime.utcnow()
        close_dt = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
        # if already passed today, assume next day
        if close_dt < now:
            close_dt = close_dt + dt.timedelta(days=1)
        return close_dt
    except Exception:
        return None

async def _auth_merchant(conn, restaurant_id: str, api_key: str):
    row = await conn.fetchrow("SELECT 1 FROM foody_restaurants WHERE restaurant_id=$1 AND api_key=$2", restaurant_id, api_key)
    if not row:
        raise HTTPException(status_code=401, detail="unauthorized")

# ---- Background workers ----
async def _discount_scheduler(app: FastAPI):
    pool = app.state.pool
    while True:
        try:
            async with pool.acquire() as conn:
                # All restaurants with close_time
                rows = await conn.fetch("SELECT restaurant_id, close_time FROM foody_restaurants WHERE close_time IS NOT NULL")
                now = dt.datetime.utcnow()
                for r in rows:
                    close_dt = _parse_close_dt(r["close_time"])
                    if not close_dt:
                        continue
                    minutes_to_close = (close_dt - now).total_seconds() / 60.0
                    # choose discount according to steps
                    discount = 0.0
                    for mins, disc in _STEPS:
                        if minutes_to_close <= mins:
                            discount = max(discount, disc)
                    # update all active offers for this restaurant: recompute price from original
                    # Only if original_price_cents present
                    await conn.execute(
                        """
                        UPDATE foody_offers
                        SET price_cents = GREATEST(0, CAST(original_price_cents * (1 - $1) AS INTEGER))
                        WHERE restaurant_id = $2
                          AND status = 'active'
                          AND original_price_cents IS NOT NULL
                        """,
                        discount,
                        r["restaurant_id"],
                    )
                # Expire offers past `expires_at`
                await conn.execute(
                    """
                    UPDATE foody_offers
                    SET status='expired'
                    WHERE status='active' AND expires_at IS NOT NULL AND expires_at < now()
                    """
                )
        except Exception as e:
            print("discount_scheduler error:", e)
        await asyncio.sleep(DISCOUNT_TICK_SECONDS)

async def _reservation_expirer(app: FastAPI):
    pool = app.state.pool
    while True:
        try:
            async with pool.acquire() as conn:
                # expire active reservations past TTL and release stock
                res = await conn.fetch(
                    """
                    SELECT id, offer_id, qty
                    FROM foody_reservations
                    WHERE status='active' AND expires_at IS NOT NULL AND expires_at < now()
                    ORDER BY id
                    LIMIT 200
                    """
                )
                if res:
                    async with conn.transaction():
                        # release qty
                        for r in res:
                            await conn.execute("UPDATE foody_offers SET qty_left = qty_left + $1 WHERE id=$2", r["qty"], r["offer_id"])
                        # mark expired
                        ids = [r["id"] for r in res]
                        await conn.execute("UPDATE foody_reservations SET status='expired' WHERE id = ANY($1::bigint[])", ids)
        except Exception as e:
            print("reservation_expirer error:", e)
        await asyncio.sleep(EXPIRE_TICK_SECONDS)

# ---- Routes ----
def mount(app: FastAPI):
    # Startup hooks
    async def start_workers():
        # make sure pool exists
        if not getattr(app.state, "pool", None):
            import asyncpg, os
            DB_URL = os.getenv("DATABASE_URL")
            app.state.pool = await asyncpg.create_pool(DB_URL, min_size=1, max_size=10)
        asyncio.create_task(_discount_scheduler(app))
        asyncio.create_task(_reservation_expirer(app))

    app.add_event_handler("startup", start_workers)

    @app.post("/api/v1/public/reserve")
    async def reserve_public(
        payload: dict = Body(..., example={"restaurant_id":"RID_...","offer_id":123,"qty":1,"ttl_minutes":30})
    ):
        rid = payload.get("restaurant_id")
        offer_id = payload.get("offer_id")
        qty = int(payload.get("qty") or 1)
        ttl_minutes = int(payload.get("ttl_minutes") or TTL_MINUTES_DEFAULT)
        if not rid or not offer_id or qty < 1:
            raise HTTPException(status_code=400, detail="Bad request")

        async with app.state.pool.acquire() as conn:
            # offer exists, active, has stock
            offer = await conn.fetchrow("SELECT * FROM foody_offers WHERE id=$1 AND restaurant_id=$2 AND status='active'", offer_id, rid)
            if not offer:
                raise HTTPException(status_code=404, detail="Offer not found")
            if offer["qty_left"] is not None and offer["qty_left"] < qty:
                raise HTTPException(status_code=400, detail="Not enough stock")

            code = "RES" + secrets.token_hex(4).upper()
            expires_at = dt.datetime.utcnow() + dt.timedelta(minutes=ttl_minutes)
            price_each = offer["price_cents"] or 0
            amount_total = price_each * qty

            async with conn.transaction():
                # hold qty
                await conn.execute("UPDATE foody_offers SET qty_left = qty_left - $1 WHERE id=$2", qty, offer_id)
                # create reservation
                row = await conn.fetchrow(
                    """
                    INSERT INTO foody_reservations
                        (restaurant_id, offer_id, qty, code, price_cents, status, created_at, expires_at)
                    VALUES ($1,$2,$3,$4,$5,'active', now(), $6)
                    RETURNING id, code, expires_at
                    """,
                    rid, offer_id, qty, code, amount_total, expires_at
                )
            return {
                "reservation_id": row["id"],
                "code": row["code"],
                "expires_at": row["expires_at"].isoformat(),
                "amount_cents": amount_total,
                "qty": qty,
                "offer_id": offer_id
            }

    @app.post("/api/v1/merchant/redeem")
    async def redeem(
        restaurant_id: str = Body(...),
        code: str = Body(...),
        x_foody_key: str = Header(None, convert_underscores=False, alias="X-Foody-Key")
    ):
        if not x_foody_key:
            raise HTTPException(status_code=401, detail="missing api key")
        async with app.state.pool.acquire() as conn:
            await _auth_merchant(conn, restaurant_id, x_foody_key)
            res = await conn.fetchrow(
                """
                SELECT r.*, o.price_cents as offer_price
                FROM foody_reservations r
                LEFT JOIN foody_offers o ON o.id = r.offer_id
                WHERE r.restaurant_id=$1 AND r.code=$2
                """,
                restaurant_id, code
            )
            if not res:
                raise HTTPException(status_code=404, detail="Reservation not found")
            if res["status"] == "expired":
                raise HTTPException(status_code=400, detail="Reservation expired")
            if res["status"] == "redeemed":
                raise HTTPException(status_code=400, detail="Already redeemed")

            amount = res["price_cents"] or res["offer_price"] or 0
            async with conn.transaction():
                await conn.execute("UPDATE foody_reservations SET status='redeemed' WHERE id=$1", res["id"])
                row = await conn.fetchrow(
                    """
                    INSERT INTO foody_redeems (restaurant_id, offer_id, code, amount_cents, redeemed_at)
                    VALUES ($1,$2,$3,$4, now())
                    RETURNING id
                    """,
                    restaurant_id, res["offer_id"], code, amount
                )

            return {"ok": True, "amount_cents": amount, "redeem_id": row["id"]}

    @app.get("/api/v1/merchant/reservations")
    async def list_reservations(
        restaurant_id: str = Query(...),
        status: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        x_foody_key: str = Header(None, convert_underscores=False, alias="X-Foody-Key")
    ):
        if not x_foody_key:
            raise HTTPException(status_code=401, detail="missing api key")
        async with app.state.pool.acquire() as conn:
            await _auth_merchant(conn, restaurant_id, x_foody_key)
            if status:
                rows = await conn.fetch(
                    """
                    SELECT * FROM foody_reservations
                    WHERE restaurant_id=$1 AND status=$2
                    ORDER BY id DESC LIMIT $3
                    """,
                    restaurant_id, status, limit
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM foody_reservations
                    WHERE restaurant_id=$1
                    ORDER BY id DESC LIMIT $2
                    """,
                    restaurant_id, limit
                )
            return [dict(r) for r in rows]
