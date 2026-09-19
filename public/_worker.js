/**
 * Keyline AI Dashboard - Cloudflare Worker / Pages Entrypoint
 * Mode: Razorpay Live Production Mode (Secure Environment Variable Configuration)
 *
 * Security:
 * - RAZORPAY_KEY_SECRET is strictly read from environment variables (env.RAZORPAY_KEY_SECRET).
 * - No secret credentials or private keys are hardcoded in source code.
 * - RAZORPAY_KEY_ID defaults to production live key 'rzp_live_Tds28oLdXkQ5fC' or env.RAZORPAY_KEY_ID.
 *
 * Routes:
 * 1. PWA static assets (/sw.js, /manifest.json, /icon-192.png, /icon-512.png)
 * 2. Gateway health & diagnostics (/api/health)
 * 3. Prepaid credit packages query (/api/packages)
 * 4. Backend Razorpay Live order creation (/api/create-order)
 * 5. Razorpay payment signature verification (/api/verify-payment)
 * 6. Razorpay Webhooks (/api/razorpay-webhook)
 * 7. Cloudflare Pages asset pipeline & SPA fallback
 */

// Fallback Live Razorpay Key ID (Public Client Identifier)
const DEFAULT_RAZORPAY_KEY_ID = "rzp_live_Tds28oLdXkQ5fC";

// Official Prepaid Credit Packages (Top-ups)
const PREPAID_PACKAGES = {
  starter: {
    id: "starter",
    name: "Starter Plan",
    amount: 49,          // in INR
    amountInPaise: 4900,  // 49 * 100 paise
    credits: 2500,        // 2,500 API Credits
    description: "2,500 API Credits"
  },
  growth: {
    id: "growth",
    name: "Growth Plan",
    amount: 99,           // in INR
    amountInPaise: 9900,  // 99 * 100 paise
    credits: 6000,        // 6,000 API Credits
    description: "6,000 API Credits"
  },
  scale: {
    id: "scale",
    name: "Scale Pro Plan",
    amount: 249,          // in INR
    amountInPaise: 24900, // 249 * 100 paise
    credits: 20000,       // 20,000 API Credits
    description: "20,000 API Credits"
  }
};

// Standard CORS Headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Razorpay-Signature, x-requested-with",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

// Web Crypto HMAC-SHA256 Generator
async function generateHmacSha256(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(message)
  );
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Retrieve Razorpay credentials strictly from environment variables
function getCredentials(env) {
  const keyId = (env && env.RAZORPAY_KEY_ID) ? env.RAZORPAY_KEY_ID : DEFAULT_RAZORPAY_KEY_ID;
  const keySecret = env && env.RAZORPAY_KEY_SECRET ? env.RAZORPAY_KEY_SECRET : null;
  const webhookSecret = (env && env.RAZORPAY_WEBHOOK_SECRET) ? env.RAZORPAY_WEBHOOK_SECRET : keySecret;
  return { keyId, keySecret, webhookSecret };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // =========================================================================
    // 1. Service Worker & PWA Static Assets Routing
    // =========================================================================
    if (url.pathname === "/sw.js") {
      if (env && env.ASSETS) {
        const res = await env.ASSETS.fetch(request);
        if (res.status === 200) {
          return new Response(res.body, {
            status: 200,
            headers: {
              ...Object.fromEntries(res.headers),
              "Content-Type": "application/javascript; charset=utf-8",
              "Service-Worker-Allowed": "/",
              "Cache-Control": "no-cache"
            }
          });
        }
      }

      const swCode = `const CACHE_NAME = 'keyline-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});`;

      return new Response(swCode, {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Service-Worker-Allowed": "/",
          "Cache-Control": "no-cache"
        }
      });
    }

    if (url.pathname === "/manifest.json") {
      if (env && env.ASSETS) {
        const res = await env.ASSETS.fetch(request);
        if (res.status === 200) {
          return new Response(res.body, {
            status: 200,
            headers: {
              ...Object.fromEntries(res.headers),
              "Content-Type": "application/manifest+json; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=3600"
            }
          });
        }
      }
    }

    if (url.pathname === "/icon-192.png" || url.pathname === "/icon-512.png") {
      if (env && env.ASSETS) {
        const res = await env.ASSETS.fetch(request);
        if (res.status === 200) {
          return new Response(res.body, {
            status: 200,
            headers: {
              ...Object.fromEntries(res.headers),
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=31536000, immutable"
            }
          });
        }
      }

      const fallbackImg = await fetch("https://i.ibb.co/VY5vPST3/IMG-20260918-WA0001.jpg");
      return new Response(fallbackImg.body, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    }

    // =========================================================================
    // 2. Razorpay Live Backend API Routes
    // =========================================================================

    // Health Check & Gateway Diagnostic
    if (url.pathname === "/api/health") {
      const { keyId, keySecret } = getCredentials(env);
      return jsonResponse({
        status: "ok",
        mode: "live",
        gateway: "Razorpay Live Mode",
        razorpayKeyId: keyId,
        hasKeySecret: Boolean(keySecret),
        timestamp: new Date().toISOString()
      });
    }

    // GET /api/packages - Return official prepaid credit top-up packages
    if (url.pathname === "/api/packages" && request.method === "GET") {
      return jsonResponse({
        packages: Object.values(PREPAID_PACKAGES)
      });
    }

    // POST /api/create-order - Create Razorpay Live Order
    if (url.pathname === "/api/create-order" && request.method === "POST") {
      try {
        const { keyId, keySecret } = getCredentials(env);

        if (!keySecret) {
          return jsonResponse({
            error: "RAZORPAY_KEY_SECRET environment variable is not configured."
          }, 500);
        }

        const body = await request.json().catch(() => ({}));

        let amountInPaise = 0;
        let credits = 0;
        let packageId = body.packageId || "growth";

        if (PREPAID_PACKAGES[packageId]) {
          const pkg = PREPAID_PACKAGES[packageId];
          amountInPaise = pkg.amountInPaise;
          credits = pkg.credits;
        } else if (body.amount) {
          amountInPaise = Math.round(parseFloat(body.amount) * 100);
          credits = body.credits || (amountInPaise / 100 * 50);
        } else {
          amountInPaise = PREPAID_PACKAGES.growth.amountInPaise;
          credits = PREPAID_PACKAGES.growth.credits;
          packageId = "growth";
        }

        if (isNaN(amountInPaise) || amountInPaise <= 0) {
          return jsonResponse({ error: "Invalid payment amount in paise." }, 400);
        }

        const receiptId = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const basicAuth = btoa(`${keyId}:${keySecret}`);

        const orderPayload = {
          amount: amountInPaise,
          currency: "INR",
          receipt: receiptId,
          payment_capture: 1,
          notes: {
            service: "Keyline AI Gateway",
            packageId: String(packageId),
            credits: String(credits),
            userId: String(body.userId || "")
          }
        };

        const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${basicAuth}`
          },
          body: JSON.stringify(orderPayload)
        });

        const orderData = await rzpResponse.json();

        if (!rzpResponse.ok) {
          console.error("Razorpay Live order creation error:", orderData);
          return jsonResponse({
            error: orderData.error?.description || "Failed to create Razorpay live order.",
            details: orderData
          }, rzpResponse.status);
        }

        return jsonResponse({
          success: true,
          id: orderData.id,
          orderId: orderData.id,
          amount: orderData.amount,
          currency: orderData.currency,
          credits: credits,
          key: keyId,
          receipt: receiptId
        });
      } catch (err) {
        console.error("Order creation internal exception:", err);
        return jsonResponse({ error: "Internal server error creating order: " + err.message }, 500);
      }
    }

    // POST /api/verify-payment - Verify Razorpay Payment Signature
    if (url.pathname === "/api/verify-payment" && request.method === "POST") {
      try {
        const { keySecret } = getCredentials(env);

        if (!keySecret) {
          return jsonResponse({
            success: false,
            verified: false,
            error: "RAZORPAY_KEY_SECRET environment variable is not configured."
          }, 500);
        }

        const body = await request.json().catch(() => ({}));

        const {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          packageId,
          credits,
          userId
        } = body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
          return jsonResponse({
            success: false,
            verified: false,
            error: "Missing required payment verification fields."
          }, 400);
        }

        // Calculate HMAC SHA-256 of "order_id|payment_id"
        const generatedSignature = await generateHmacSha256(
          `${razorpay_order_id}|${razorpay_payment_id}`,
          keySecret
        );

        if (generatedSignature !== razorpay_signature) {
          console.error("Signature mismatch:", { generatedSignature, received: razorpay_signature });
          return jsonResponse({
            success: false,
            verified: false,
            error: "Invalid Razorpay payment signature. Verification failed."
          }, 400);
        }

        // Determine token credits allocated
        let allocatedCredits = credits || 0;
        if (!allocatedCredits && packageId && PREPAID_PACKAGES[packageId]) {
          allocatedCredits = PREPAID_PACKAGES[packageId].credits;
        }

        return jsonResponse({
          success: true,
          verified: true,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          credits: allocatedCredits,
          userId: userId || "",
          message: "Payment signature verified successfully in Live Mode."
        });
      } catch (err) {
        console.error("Verification internal exception:", err);
        return jsonResponse({ error: "Internal error during payment verification: " + err.message }, 500);
      }
    }

    // POST /api/razorpay-webhook - Razorpay Server-to-Server Webhook Handler
    if (url.pathname === "/api/razorpay-webhook" && request.method === "POST") {
      try {
        const { webhookSecret } = getCredentials(env);

        if (!webhookSecret) {
          return jsonResponse({
            error: "RAZORPAY_KEY_SECRET environment variable is not configured."
          }, 500);
        }

        const signatureHeader = request.headers.get("x-razorpay-signature");
        const rawBody = await request.text();

        if (signatureHeader && webhookSecret) {
          const expectedSignature = await generateHmacSha256(rawBody, webhookSecret);
          if (expectedSignature !== signatureHeader) {
            console.error("Webhook signature mismatch");
            return jsonResponse({ error: "Invalid webhook signature" }, 400);
          }
        }

        const event = JSON.parse(rawBody || "{}");
        console.log("Razorpay Live Webhook received:", event.event);

        return jsonResponse({
          status: "ok",
          received: true,
          event: event.event || "unknown"
        });
      } catch (err) {
        console.error("Webhook processing error:", err);
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // =========================================================================
    // 3. Fallback to Cloudflare Pages Static Assets Pipeline
    // =========================================================================
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  }
};
