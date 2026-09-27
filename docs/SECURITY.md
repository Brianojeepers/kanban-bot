# Security Audit & Findings

**Last Updated**: 2026-09-27  
**Overall Risk Level**: LOW  
**Status**: Active — Recommendations in progress

---

## Executive Summary

The Project Management application demonstrates strong security fundamentals with proper authentication, authorization, parameterized SQL queries, and rate limiting. No critical or high-severity vulnerabilities were identified during comprehensive security audit.

**Key Metrics:**
- Authentication: HMAC-SHA256 signed tokens, scrypt password hashing
- Authorization: Board ownership & membership checks on all endpoints
- SQL Injection Prevention: 100% parameterized queries
- Rate Limiting: Login (10/min), registration (5/hr), chat (10/min, 100/24h)
- Test Coverage: 99.75% (133 tests passing)

---

## Medium-Severity Findings (Recommend Fixing)

### 1. Missing Security Headers
**File**: `backend/app/main.py`  
**Severity**: MEDIUM  
**Status**: OPEN  

**Finding**: Application does not set security headers (X-Frame-Options, X-Content-Type-Options, Content-Security-Policy).

**Impact**: 
- Clickjacking attacks possible
- MIME-sniffing vulnerabilities
- No protection against inline script injection

**Recommendation**:
```python
# Add middleware to set headers
from fastapi.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response

app.add_middleware(SecurityHeadersMiddleware)
```

**Effort**: 15 minutes

---

### 2. SameSite Cookie Too Permissive
**File**: `backend/app/main.py:133`  
**Severity**: MEDIUM  
**Status**: OPEN  

**Current**: `samesite="lax"`  
**Finding**: Lax SameSite allows cross-site requests to include session cookies.

**Impact**:
- Weak CSRF protection
- Session cookie can be sent in cross-site POST requests via form submissions
- Attacker-controlled site could perform actions on user's behalf

**Recommendation**:
```python
# Change to:
response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="strict")
```

**Tradeoff**: `strict` may break legitimate cross-site navigation patterns (rare for single-origin app).

**Effort**: 5 minutes

---

### 3. Insufficient Rate Limiting Scope
**File**: `backend/app/rate_limit.py`  
**Severity**: MEDIUM  
**Status**: OPEN  

**Current Coverage**:
- ✅ Login attempts: 10/minute
- ✅ Registration: 5/hour
- ✅ Chat messages: 10/minute, 100/24h
- ❌ Board creation/deletion
- ❌ Card operations (create, edit, move, delete)
- ❌ Comments
- ❌ Checklist operations
- ❌ Member management

**Impact**:
- Users can abuse unlimited board/card/comment creation
- Potential disk space exhaustion
- DoS vectors on database

**Recommendation**:
```python
# Extend rate limiting to all mutations
board_mutation_limiter = RateLimiter(60, 60)  # 60 ops/minute per user
comment_limiter = RateLimiter(120, 60)       # 120 comments/minute per user

# Apply to endpoints:
# POST /api/boards
# PATCH /api/boards/{board_id}
# DELETE /api/boards/{board_id}
# POST /api/boards/{board_id}/columns/{column_id}/cards
# PATCH /api/boards/{board_id}/cards/{card_id}
# DELETE /api/boards/{board_id}/cards/{card_id}
# POST /api/boards/{board_id}/cards/{card_id}/comments
```

**Effort**: 1-2 hours

---

### 4. AI Error Message Disclosure
**File**: `backend/app/main.py:378`  
**Severity**: MEDIUM  
**Status**: OPEN  

**Finding**: Raw error messages from OpenRouter API exposed to clients.

```python
# Current (line 378):
except ValueError as error:
    raise HTTPException(status_code=502, detail=str(error)) from error
```

**Impact**:
- Reveals API implementation details
- Discloses rate limit information from provider
- May leak model configuration

**Recommendation**:
```python
import logging

logger = logging.getLogger(__name__)

@app.post("/api/boards/{board_id}/chat")
def send_chat(...):
    try:
        return chat.ask(...)
    except ValueError as error:
        logger.error(f"Chat request failed: {error}")
        raise HTTPException(status_code=502, detail="Chat service temporarily unavailable")
```

**Effort**: 15 minutes

---

## Low-Severity Findings (Consider Fixing)

### 5. No Database Connection Timeout
**File**: `backend/app/db.py`  
**Severity**: LOW  
**Issue**: `sqlite3.connect()` has no timeout set.

**Impact**: Can cause thread hangs if database is locked.

**Fix**: 
```python
connection = sqlite3.connect(DATABASE_PATH, timeout=5.0)
```

---

### 6. Unvalidated Position Parameter
**File**: `backend/app/main.py:81`  
**Severity**: LOW  
**Issue**: `MoveRequest.position` has no minimum value constraint.

**Fix**:
```python
from pydantic import Field

class MoveRequest(BaseModel):
    column_id: str
    position: int = Field(ge=0)  # Non-negative only
```

---

### 7. CardUpdateRequest Empty String Vulnerability
**File**: `backend/app/main.py:71`  
**Severity**: LOW  
**Issue**: Allows clearing title/details to empty strings.

**Fix**: Exclude empty strings or validate in `update_card`.
```python
class CardUpdateRequest(BaseModel):
    title: board.Title = ""
    details: board.Details = ""
    # ... use model_fields_set to avoid applying empty defaults
```

---

### 8. Timing Attack Risk
**File**: `backend/app/auth.py`  
**Severity**: LOW  
**Issue**: Session parsing may have variable timing due to early returns.

**Recommendation**: Use constant-time comparison for session verification.

---

### 9. No Request Body Size Limits
**File**: `backend/app/main.py`  
**Severity**: LOW  
**Issue**: No explicit `max_request_size` configured.

**Fix**:
```python
app = FastAPI(..., max_request_size=1_000_000)  # 1MB
```

---

### 10. Hardcoded Demo Credentials
**File**: `backend/app/db.py`, test files  
**Severity**: LOW  
**Issue**: Demo account (`user` / `password`) always seeded.

**Fix**: Gate behind environment variable.
```python
def initialize():
    # ... schema creation ...
    if os.getenv("SEED_DEMO_ACCOUNT"):
        # seed demo account
```

---

### 11. Chat Prompt Injection Not Mitigated
**File**: `backend/app/chat.py`  
**Severity**: LOW  
**Issue**: User input embedded in AI prompt without explicit boundary.

**Mitigation**: Already implemented — operations validated before execution. Good practice: keep user input clearly separated.

```python
# Good: explicit boundary
prompt = f"""Current board state:
{json.dumps(board_state)}

---USER_INPUT_START---
{user_message}
---USER_INPUT_END---

Only modify the board specified above."""
```

---

### 12. Manual Cascading Deletes Instead of DB Constraints
**File**: `backend/app/board.py:103-112`, `backend/app/db.py:129`  
**Severity**: LOW  
**Issue**: Foreign keys disabled; cascading delete logic in application code.

**Fix**: Enable foreign keys, use `ON DELETE CASCADE`.
```sql
PRAGMA foreign_keys = ON;

CREATE TABLE card_labels (
    card_id TEXT NOT NULL,
    label TEXT NOT NULL,
    FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
);
```

---

### 13. No Rate Limiting on Read Operations
**File**: `backend/app/rate_limit.py`  
**Severity**: LOW  
**Issue**: Board list/get endpoints allow unlimited reads.

**Recommendation**: Light rate limiting on read operations to prevent information gathering.
```python
read_limiter = RateLimiter(1000, 60)  # 1000 reads/minute per user
```

---

## Security Strengths ✅

### Authentication
- **Token Format**: `{user_id}.{signature}` with HMAC-SHA256
- **Password Hashing**: Scrypt with n=2^14, r=8, p=1 (industry standard)
- **Session Rotation**: Password change rotates session_key, invalidating other sessions
- **Cookie Security**: HTTP-only flag prevents JavaScript access

### Authorization
- **Board Access**: `require_board()` checks user owns or is member
- **Owner-Only Actions**: `require_owner()` for rename, delete, member management
- **Scope Enforcement**: All endpoints properly scoped to board_id

### Data Protection
- **SQL Injection Prevention**: 100% parameterized queries in board.py
- **Input Validation**: Pydantic StringConstraints on all user inputs (usernames, passwords, titles, labels, etc.)
- **No Dangerous Patterns**: No innerHTML, eval, shell execution, or CORS

### Infrastructure
- **Docker**: Non-root execution, minimal base images
- **Secrets**: OPENROUTER_API_KEY and SESSION_SECRET from environment, never in code
- **Volume Persistence**: Database persisted in named Docker volume

### Frontend
- **XSS Prevention**: React auto-escaping, no dangerouslySetInnerHTML
- **No Secrets in Code**: API keys never sent to browser
- **Safe Error Handling**: Generic error messages to users

---

## Remediation Timeline

### Immediate (Week 1)
- [ ] Add security headers middleware (15 min)
- [ ] Change SameSite to strict (5 min)
- [ ] Add database connection timeout (5 min)
- [ ] Validate position parameter (5 min)

### Short-term (Week 2-3)
- [ ] Add AI error logging with generic client messages (1 hr)
- [ ] Extend rate limiting to board/card operations (1-2 hrs)
- [ ] Add request body size limits (15 min)

### Medium-term (Month 1)
- [ ] Enable foreign keys and use ON DELETE CASCADE (2-3 hrs)
- [ ] Gate demo account seeding with env var (30 min)
- [ ] Add read operation rate limiting (1 hr)
- [ ] Implement timing attack mitigation (1 hr)

### Total Estimated Effort: 8-16 hours

---

## Compliance Notes

- **OWASP Top 10**: Addresses injection, broken auth, sensitive data, security misconfiguration
- **Data Protection**: No PII outside username; no tracking, analytics, or third-party services
- **Audit Logging**: Activity log records all mutations by user

---

## Future Considerations

- [ ] Add request logging/audit trail to support forensics
- [ ] Implement brute-force account lockout (currently relies on rate limiting)
- [ ] Add HTTPS enforcement headers (HSTS)
- [ ] Consider implementing logout of all sessions on security events
- [ ] Regular dependency updates and security scanning
- [ ] Penetration testing before any public release

---

## Contact & Updates

This document is maintained as part of ongoing security review. Update when:
- Security findings are identified
- Recommendations are implemented
- New dependencies are added
- Architecture changes occur

Last reviewed: 2026-09-27  
Next review: 2026-12-27 (quarterly)
