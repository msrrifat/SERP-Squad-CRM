/* step-by-step "where do I get this" guides — rendered by the ? Guide button
   on every credential card (generic fallback covers new entries automatically) */
export const API_GUIDES = {
  dataforseo: ["Create an account at app.dataforseo.com (free trial credits included).", "Dashboard → API Access shows your API login (your email) and API password.", "Paste both here — rank tracking, geo-grid scans and index checks go live instantly."],
  googleOauth: ["Go to console.cloud.google.com → create/select a project.", "APIs & Services → Enable: Business Profile API, Analytics Data API, Search Console API.", "OAuth consent screen → External → add your agency domain.", "Credentials → Create credentials → OAuth client ID → Web application.", "Authorized redirect URI: exactly https://app.serpsquad.com/oauth/google/callback.", "Copy the Client ID and Client Secret here."],
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
  wordpressCom: ["developer.wordpress.com/apps → Create new application.", "Redirect URL: https://app.serpsquad.com/oauth/wpcom/callback.", "Copy the Client ID and Secret here — brand-site publishing uses them."],
  tumblr: ["www.tumblr.com/oauth/apps → Register application.", "Default callback: https://app.serpsquad.com/oauth/tumblr/callback.", "Paste the OAuth consumer key and secret here."],
  webflow: ["Webflow Dashboard → Apps & Integrations → API access → generate a site token (or register an OAuth app at developers.webflow.com).", "Paste the client credentials here; per-site tokens are entered in each project's Connector tab."],
  meta: ["developers.facebook.com → Create App (Business) → add Facebook Login + Pages/Instagram Graph products.", "App Review: request pages_manage_posts and instagram_content_publish.", "Paste the App ID and Secret here."],
};

