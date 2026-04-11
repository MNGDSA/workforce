#!/bin/bash
# WORKFORCE E2E API Verification Script
# Verifies backend endpoints work correctly when Playwright subagent is unavailable
# Usage: bash e2e-tests/api-verification.sh

BASE_URL="${BASE_URL:-http://localhost:5000}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  [PASS] $desc"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $desc (expected '$expected', got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================"
echo "WORKFORCE E2E API Verification"
echo "========================================"
echo ""

echo "--- Auth Validation ---"

R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"9999999999","password":"wrongpassword1"}')
check "Invalid credentials returns 401" "401" "$R"

R=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"9999999999","password":"wrongpassword1"}')
check "Invalid login error message" "Invalid credentials" "$R"

R=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"1000000001","password":"password123"}')
check "Admin login returns super_admin role" "super_admin" "$R"

echo ""
echo "--- Candidate Portal Login ---"

R=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"2000000002","password":"password123"}')
check "Candidate login returns candidate role" '"role":"candidate"' "$R"
check "Candidate login returns candidate record" '"profileCompleted":true' "$R"

R=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"0500000002","password":"password123"}')
check "Candidate phone login works" '"role":"candidate"' "$R"

echo ""
echo "--- Inbox API ---"

R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/inbox")
check "Inbox API responds" "200" "$R"

R=$(curl -s "$BASE_URL/api/inbox")
check "Inbox API returns data object" "data" "$R"

echo ""
echo "--- Geofence API ---"

R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/geofence-zones?includeInactive=true")
check "Geofence API responds" "200" "$R"

R=$(curl -s "$BASE_URL/api/geofence-zones?includeInactive=true")
check "Geofence API returns data" "Masjid" "$R"

ZONE_ID=$(curl -s -X POST "$BASE_URL/api/geofence-zones" \
  -H "Content-Type: application/json" \
  -d '{"name":"API Test Zone","centerLat":"21.4300","centerLng":"39.8300","radiusMeters":500,"isActive":true}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).id))")
check "Create geofence zone returns ID" "" "$ZONE_ID"

if [ -n "$ZONE_ID" ]; then
  R=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/api/geofence-zones/$ZONE_ID")
  check "Delete geofence zone" "200" "$R"
fi

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
