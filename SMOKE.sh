#!/usr/bin/env bash
set -euo pipefail
FOODY_API="${FOODY_API:-https://foodyback-production.up.railway.app}"
echo "Health:"; curl -fsS "$FOODY_API/health" && echo
echo "Register:"
reg=$(curl -fsS -X POST "$FOODY_API/api/v1/merchant/register_public" -H "Content-Type: application/json" -d '{"name":"Demo Cafe","phone":"+7 900 000-00-00"}')
echo "$reg"
RID=$(echo "$reg" | sed -n 's/.*"restaurant_id":"\([^"]*\)".*/\1/p')
KEY=$(echo "$reg" | sed -n 's/.*"api_key":"\([^"]*\)".*/\1/p')
echo "RID=$RID"; echo "KEY=$KEY"
echo "Create offer:"
curl -fsS -X POST "$FOODY_API/api/v1/merchant/offers" -H "Content-Type: application/json" -H "X-Foody-Key: $KEY" -d "{"restaurant_id":"$RID","title":"Эклеры","price_cents":19900,"original_price_cents":34900,"qty_total":5,"qty_left":5,"expires_at":"2030-12-31T20:00:00Z","description":"6 шт.","image_url":""}"
echo
echo "List offers:"; curl -fsS "$FOODY_API/api/v1/merchant/offers?restaurant_id=$RID" -H "X-Foody-Key: $KEY" && echo
echo "Public feed:"; curl -fsS "$FOODY_API/api/v1/offers" && echo
echo "Stats:"; curl -fsS "$FOODY_API/api/v1/merchant/stats?restaurant_id=$RID" -H "X-Foody-Key: $KEY" && echo
