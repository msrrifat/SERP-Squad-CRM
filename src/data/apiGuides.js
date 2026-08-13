/* step-by-step "where do I get this" guides — rendered by the ? Guide button
   on every credential card (generic fallback covers new entries automatically) */
export const API_GUIDES = {
  dataforseo: ["Create an account at app.dataforseo.com (free trial credits included).", "Dashboard → API Access shows your API login (your email) and API password.", "Paste both here — rank tracking, geo-grid scans and index checks go live instantly."],
  googleOauth: ["Go to console.cloud.google.com → create/select a project.", "APIs & Services → Enable: Business Profile API, Analytics Data API, Search Console API.", "OAuth consent screen → External → add your agency domain.", "Credentials → Create credentials → OAuth client ID → Web application.", "Authorized redirect URI: exactly https://app.serpsquad.com/api/oauth/google/callback (the /api segment matters — without it the code lands on the app shell and Google reports redirect_uri_mismatch).", "For the YouTube connector too: add https://app.serpsquad.com/api/oauth/social/callback as a SECOND redirect URI and enable the YouTube Data API v3.", "Copy the Client ID and Client Secret here."],
  googlePlaces: ["console.cloud.google.com → APIs & Services → Enable 'Places API'.", "Credentials → Create credentials → API key.", "Restrict the key to the Places API (recommended), then paste it here."],
  metaAds: ["developers.facebook.com → My Apps → Create App → type 'Business'.", "Add the Marketing API product to the app.", "Business Settings → System users → create one with ads_management permission.", "Generate a long-lived system-user access token and paste App ID, Secret and token here."],
  googleAds: ["Apply for a developer token: Google Ads → MCC account → Tools → API Center.", "Token starts in test mode — apply for Basic access for production.", "Enter the developer token and your manager (MCC) customer ID here; sign-in uses the Google OAuth app above."],
  tiktokAds: ["business-api.tiktok.com/portal → Become a developer → Create app.", "Choose the Ads Management scope set.", "Authorize your advertiser account → copy the long-term access token.", "Paste App ID, Secret and the token here."],
  redditAds: ["ads.reddit.com → your business account → ads-api.reddit.com/docs to request access.", "Create the OAuth app (script/web type) in Reddit app preferences.", "Complete one OAuth round to obtain a refresh token; paste all three values here."],
  nextdoorAds: ["Nextdoor Ads Manager → request API access at developer.nextdoor.com.", "Once approved, generate the NAM API key from the developer console and paste it here."],
  yelpAds: ["Yelp Ads API requires partner approval — apply at docs.developer.yelp.com/docs/ads-api.", "Once accepted, create the partner API key and paste it with your default business ID."],
  openai: ["platform.openai.com → API keys → Create new secret key.", "Add billing (pay-as-you-go) so requests aren't rejected.", "Paste the sk-… key here; model defaults to gpt-4o if left blank."],
  claude: ["console.anthropic.com → API Keys → Create key.", "Add a payment method under Billing.", "Paste the key here — Claude then powers content, ads copy and the agent when activated."],
  gemini: ["aistudio.google.com → Get API key → create in a Cloud project.", "Paste the AIza… key here."],
  deepseek: ["platform.deepseek.com → API Keys → create one; add credit balance.", "Paste the key here."],
  wordpressCom: ["developer.wordpress.com/apps → Create new application.", "Redirect URL: any placeholder works for now (e.g. https://app.serpsquad.com) — the CRM does not yet run an OAuth round trip for WordPress.com; the credentials are stored here ready for when that publishing path goes live.", "Copy the Client ID and Secret here — brand-site publishing uses them."],
  tumblr: ["www.tumblr.com/oauth/apps → Register application.", "Default callback: any placeholder works for now (e.g. https://app.serpsquad.com) — the CRM does not yet run an OAuth round trip for Tumblr; the credentials are stored here ready for when that publishing path goes live.", "Paste the OAuth consumer key and secret here."],
  webflow: ["Webflow Dashboard → Apps & Integrations → API access → generate a site token (or register an OAuth app at developers.webflow.com).", "Paste the client credentials here; per-site tokens are entered in each project's Connector tab."],

  /* ---- Social connectors — each ends at the SAME callback URL, which is the
     one the server actually serves: /api/oauth/social/callback ---- */
  metaApp: [
    "developers.facebook.com/apps → Create app → type 'Business'. One app covers Facebook Pages AND Instagram Business.",
    "Add products: 'Facebook Login for Business' and 'Instagram Graph API'.",
    "Facebook Login → Settings → Valid OAuth Redirect URIs: https://app.serpsquad.com/api/oauth/social/callback",
    "App settings → Basic → copy the App ID and App Secret into the fields here.",
    "Publishing to client Pages/profiles needs Meta App Review for pages_manage_posts and instagram_content_publish — until approved it only works on accounts that have a role on your app.",
  ],
  threadsApp: [
    "developers.facebook.com/apps → Create app → add the 'Threads API' use case (a separate app from Facebook/Instagram).",
    "Threads API settings → Redirect Callback URL: https://app.serpsquad.com/api/oauth/social/callback",
    "Copy the Threads App ID and App Secret here.",
    "threads_content_publish needs review before it works for accounts outside your app's testers.",
  ],
  linkedinApp: [
    "linkedin.com/developers/apps → Create app (it must be attached to a company Page you admin).",
    "Products tab → request 'Sign In with LinkedIn using OpenID Connect' and 'Share on LinkedIn' (instant approval).",
    "Auth tab → Authorized redirect URLs: https://app.serpsquad.com/api/oauth/social/callback",
    "Copy the Client ID and Client Secret here.",
    "Posting as a company PAGE (not a person) additionally needs the Community Management API, which LinkedIn reviews.",
  ],
  xApp: [
    "developer.x.com → create a developer account → Projects & Apps → create a Project with an App inside it.",
    "App → User authentication settings → set up OAuth 2.0, App type 'Web App'.",
    "Callback URI: https://app.serpsquad.com/api/oauth/social/callback  ·  Website URL: https://app.serpsquad.com",
    "Copy the OAuth 2.0 Client ID and Client Secret here.",
    "Connecting works on the free tier; PUBLISHING requires a paid API tier (Basic or above).",
  ],
  tiktokApp: [
    "developers.tiktok.com → Manage apps → Create app (business type).",
    "Add products: 'Login Kit' and 'Content Posting API'.",
    "Login Kit → Redirect URI: https://app.serpsquad.com/api/oauth/social/callback",
    "Copy the Client key and Client secret here.",
    "Unaudited apps can only post PRIVATE videos — request the Content Posting audit for public publishing.",
  ],
  pinterestApp: [
    "developers.pinterest.com/apps → Connect app (requires a Pinterest business account).",
    "Redirect URI: https://app.serpsquad.com/api/oauth/social/callback",
    "Copy the App ID and App secret here.",
    "Trial access covers boards on your own account; standard access needs Pinterest's review.",
  ],
  bingWebmaster: [
    "Sign in at bing.com/webmasters with the Microsoft account that owns your sites.",
    "Verify each client site — or Settings → 'Google Search Console accounts' to import already-verified GSC sites in bulk.",
    "Settings (gear) → API access → API Key → Generate API Key.",
    "Paste the key here. ONE key covers every verified site on the account; regenerating it in Bing invalidates this copy.",
  ],
  bingPlaces: [
    "There is no Azure app and no self-service key — access is granted by Microsoft's partner team only.",
    "Create/verify your business listings at bingplaces.com under your Microsoft account.",
    "Email partneronbp@microsoft.com asking for Trusted Partner API onboarding, naming that account email.",
    "Microsoft replies with a PUID and a client certificate + key — paste all of them here when they arrive.",
  ],
};

