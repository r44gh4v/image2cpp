const DEFAULT_COUNTER_KEY = "unique-visits-v1";
const COUNTED_COOKIE_NAME = "image2cpp_counted";
const COUNTED_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 3;

function normalizeCounterKey(rawValue) {
    const normalized = String(rawValue || "")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return normalized || DEFAULT_COUNTER_KEY;
}

function readCookie(headerValue, cookieName) {
    if (typeof headerValue !== "string" || headerValue.length === 0) {
        return null;
    }

    const token = `${cookieName}=`;
    const parts = headerValue.split(";");

    for (let i = 0; i < parts.length; i += 1) {
        const candidate = parts[i].trim();
        if (candidate.startsWith(token)) {
            return decodeURIComponent(candidate.slice(token.length));
        }
    }

    return null;
}

function createJsonResponse(payload, statusCode, extraHeaders) {
    const headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Vary: "Cookie",
        ...extraHeaders,
    };

    return new Response(JSON.stringify(payload), {
        status: statusCode,
        headers,
    });
}

async function ensureSchema(db) {
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS visit_counters (
            counter_key TEXT PRIMARY KEY,
            value INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
}

async function readCounterValue(db, counterKey) {
    const row = await db
        .prepare("SELECT value FROM visit_counters WHERE counter_key = ?1")
        .bind(counterKey)
        .first();

    const value = Number(row && row.value);
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }

    return Math.floor(value);
}

async function incrementCounterValue(db, counterKey) {
    await db
        .prepare(`
            INSERT INTO visit_counters (counter_key, value, updated_at)
            VALUES (?1, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(counter_key)
            DO UPDATE SET
                value = visit_counters.value + 1,
                updated_at = CURRENT_TIMESTAMP
        `)
        .bind(counterKey)
        .run();

    return readCounterValue(db, counterKey);
}

async function handleRequest(context) {
    const { request, env } = context;

    if (!env || !env.VISITS_DB || typeof env.VISITS_DB.prepare !== "function") {
        return createJsonResponse(
            {
                value: null,
                error: "visits_db_binding_missing",
            },
            503,
        );
    }

    const url = new URL(request.url);
    const operation = url.searchParams.get("op") === "hit" ? "hit" : "get";
    const counterKey = normalizeCounterKey(url.searchParams.get("key"));
    const alreadyCounted = readCookie(request.headers.get("cookie"), COUNTED_COOKIE_NAME) === "1";

    try {
        await ensureSchema(env.VISITS_DB);

        let value;
        let incremented = false;

        if (operation === "hit" && !alreadyCounted) {
            value = await incrementCounterValue(env.VISITS_DB, counterKey);
            incremented = true;
        } else {
            value = await readCounterValue(env.VISITS_DB, counterKey);
        }

        const responseHeaders = {};
        if (incremented) {
            responseHeaders["Set-Cookie"] = `${COUNTED_COOKIE_NAME}=1; Max-Age=${COUNTED_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax; Secure`;
        }

        return createJsonResponse(
            {
                value,
                key: counterKey,
                counted: alreadyCounted || incremented,
                source: incremented ? "increment" : "read",
            },
            200,
            responseHeaders,
        );
    } catch (error) {
        return createJsonResponse(
            {
                value: null,
                error: "visits_counter_backend_error",
            },
            500,
        );
    }
}

export async function onRequestGet(context) {
    return handleRequest(context);
}

export async function onRequestPost(context) {
    return handleRequest(context);
}
