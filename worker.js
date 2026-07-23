export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const mockId = url.searchParams.get("id");
    const folderPath = url.searchParams.get("path");
    const origin = request.headers.get("Origin") || request.headers.get("Referer");

    const allowedOrigins = [
      "https://mockmatrixhub.in",
      "https://www.mockmatrixhub.in",
      "https://mockmatrixhub.pages.dev",
    ];
    const isAllowedOrigin = origin && allowedOrigins.some((o) => origin.includes(o.replace("https://", "")));
    const allowOrigin = isAllowedOrigin ? origin : allowedOrigins[0];

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (!isAllowedOrigin) {
      return new Response("Access Denied", { status: 403, headers: corsHeaders });
    }

    if (!mockId || !folderPath) {
      return new Response("Missing Parameters", { status: 400, headers: corsHeaders });
    }

    // --- 1. TRY FREE FILE DIRECTLY FROM PRIVATE GITHUB API ---
    const freeUrl = `https://api.github.com/repos/${env.GH_USER}/${env.GH_REPO}/contents/free/${folderPath}/${mockId}.json`;
    const freeRes = await fetch(freeUrl, {
      headers: { 
        "Authorization": `token ${env.GH_TOKEN}`,
        "Accept": "application/vnd.github.v3.raw",
        "User-Agent": "Cloudflare-Worker" 
      }
    });

    if (freeRes.ok) {
      const response = new Response(freeRes.body, freeRes);
      Object.keys(corsHeaders).forEach(h => response.headers.set(h, corsHeaders[h]));
      return response;
    }

    // --- 2. AUTHENTICATION CHECKS FOR PAID USER ---
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Payment Required", { status: 402, headers: corsHeaders });
    }

    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { "Authorization": authHeader, "apikey": env.SUPABASE_ANON_KEY }
    });

    if (!userRes.ok) {
      return new Response("Invalid Session", { status: 401, headers: corsHeaders });
    }

    const userData = await userRes.json();
    const profileRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userData.id}&select=is_paid`, {
      headers: { "apikey": env.SUPABASE_ANON_KEY, "Authorization": authHeader }
    });
    const profile = await profileRes.json();

    if (!profile[0]?.is_paid) {
      return new Response("Upgrade Required", { status: 402, headers: corsHeaders });
    }

    // --- 3. FETCH PAID FILE DIRECTLY FROM PRIVATE GITHUB API ---
    const paidUrl = `https://api.github.com/repos/${env.GH_USER}/${env.GH_REPO}/contents/paid/${folderPath}/${mockId}.json`;
    const paidRes = await fetch(paidUrl, {
      headers: { 
        "Authorization": `token ${env.GH_TOKEN}`,
        "Accept": "application/vnd.github.v3.raw",
        "User-Agent": "Cloudflare-Worker" 
      }
    });

    if (paidRes.ok) {
      const response = new Response(paidRes.body, paidRes);
      Object.keys(corsHeaders).forEach(h => response.headers.set(h, corsHeaders[h]));
      return response;
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
