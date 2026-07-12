<?php
/**
 * SERP Squad Publisher — drop-in endpoint for CUSTOM-CODED websites.
 *
 * Upload this single file to your site's web root (next to index.html) and
 * paste your site key below. The CRM can then publish pages and blog posts
 * (including scheduled posts) directly to this site — no CMS required.
 *
 * Security: requests must carry the X-SS-Key header matching SS_SITE_KEY.
 * The endpoint only ever writes files it manages (tracked in ss-pages.json /
 * ss-posts.json) and refuses path traversal. Delete this file to revoke.
 */

define('SS_SITE_KEY', 'PASTE_YOUR_SITE_KEY_HERE');   // ← from the CRM's Connector tab (ss_live_…)

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-SS-Key');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$ROOT = __DIR__;
$PAGES_MANIFEST = $ROOT . '/ss-pages.json';
$POSTS_MANIFEST = $ROOT . '/ss-posts.json';
$QUEUE_FILE     = $ROOT . '/ss-queue.json';

function out($code, $data) { http_response_code($code); echo json_encode($data); exit; }
function load($f) { return file_exists($f) ? (json_decode(file_get_contents($f), true) ?: []) : []; }
function save($f, $d) { file_put_contents($f, json_encode($d, JSON_PRETTY_PRINT)); }

/* ---- auth ---- */
$key = $_SERVER['HTTP_X_SS_KEY'] ?? '';
if (SS_SITE_KEY === 'PASTE_YOUR_SITE_KEY_HERE') out(503, ['error' => 'not_configured', 'detail' => 'Site key not set — edit serp-squad-publish.php and paste your key from the Connector tab.']);
if (!hash_equals(SS_SITE_KEY, $key)) out(401, ['error' => 'unauthorized', 'detail' => 'X-SS-Key does not match this site\'s key.']);

/* ---- sanitize a relative path: a-z0-9/-_ only, no traversal, no leading / ---- */
function cleanPath($p) {
    $p = trim((string)$p, "/ \t");
    if ($p === '' ) return '';
    if (!preg_match('#^[a-z0-9/_-]{1,200}$#i', $p) || strpos($p, '..') !== false) return null;
    return $p;
}
function writePage($root, $rel, $html) {
    $dir = $rel === '' ? $root : $root . '/' . $rel;
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) return false;
    return file_put_contents($dir . '/index.html', $html) !== false;
}

/* ---- blog index regeneration from the posts manifest ---- */
function rebuildBlogIndex($root, $posts) {
    $items = '';
    usort($posts, fn($a, $b) => ($b['publishedAt'] ?? 0) <=> ($a['publishedAt'] ?? 0));
    foreach ($posts as $p) {
        if (($p['status'] ?? '') !== 'published') continue;
        $items .= '<article class="card"><h2><a href="/blog/' . htmlspecialchars($p['slug']) . '/">' . htmlspecialchars($p['title']) . '</a></h2>'
                . '<p>' . htmlspecialchars($p['metaDesc'] ?? '') . '</p>'
                . '<time>' . date('F j, Y', (int)(($p['publishedAt'] ?? time() * 1000) / 1000)) . '</time></article>';
    }
    $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          . '<title>Blog</title><style>body{font:16px/1.6 -apple-system,sans-serif;max-width:760px;margin:0 auto;padding:24px 5vw}.card{border-bottom:1px solid #e6e9ee;padding:18px 0}h2{margin:0 0 6px}a{color:#0E7C66}time{color:#889;font-size:13px}</style>'
          . '</head><body><h1>Blog</h1>' . $items . '</body></html>';
    writePage($root, 'blog', $html);
}

/* ---- scheduled-post queue: publish everything due (runs on every request) ---- */
function flushQueue($root, $queueFile, $postsFile) {
    $queue = load($queueFile); $posts = load($postsFile); $left = []; $published = 0;
    foreach ($queue as $q) {
        if (($q['publishAt'] ?? 0) <= time() * 1000) {
            writePage($root, 'blog/' . $q['slug'], $q['html']);
            $q['status'] = 'published'; $q['publishedAt'] = $q['publishAt'];
            unset($q['html']);
            $posts[$q['slug']] = $q;
            $published++;
        } else { $left[] = $q; }
    }
    if ($published) { save($queueFile, $left); save($postsFile, $posts); rebuildBlogIndex($root, array_values($posts)); }
    return $published;
}
$flushed = flushQueue($ROOT, $QUEUE_FILE, $POSTS_MANIFEST);

/* ---- actions ---- */
$body = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $body['action'] ?? 'health';

if ($action === 'health') {
    out(200, ['ok' => true, 'writable' => is_writable($ROOT), 'managedPages' => count(load($PAGES_MANIFEST)), 'managedPosts' => count(load($POSTS_MANIFEST)), 'queued' => count(load($QUEUE_FILE)), 'justPublished' => $flushed]);
}

if ($action === 'deploy_page') {
    $rel = cleanPath($body['path'] ?? null);
    if ($rel === null) out(400, ['error' => 'bad_path']);
    if (!writePage($ROOT, $rel, (string)($body['html'] ?? ''))) out(500, ['error' => 'write_failed', 'detail' => 'Directory not writable — check file permissions (755).']);
    $pages = load($PAGES_MANIFEST);
    $pages[$rel === '' ? '/' : $rel] = ['at' => time()];
    save($PAGES_MANIFEST, $pages);
    out(200, ['ok' => true, 'url' => '/' . $rel]);
}

if ($action === 'deploy_post') {
    $slug = cleanPath($body['slug'] ?? null);
    if (!$slug || strpos($slug, '/') !== false) out(400, ['error' => 'bad_slug']);
    $meta = ['slug' => $slug, 'title' => (string)($body['title'] ?? $slug), 'metaDesc' => (string)($body['metaDesc'] ?? '')];
    if (!empty($body['publishAt']) && $body['publishAt'] > time() * 1000) {
        $queue = load($QUEUE_FILE);
        $queue = array_values(array_filter($queue, fn($q) => $q['slug'] !== $slug));
        $queue[] = $meta + ['publishAt' => (int)$body['publishAt'], 'status' => 'scheduled', 'html' => (string)($body['html'] ?? '')];
        save($QUEUE_FILE, $queue);
        out(200, ['ok' => true, 'scheduled' => true, 'publishAt' => (int)$body['publishAt']]);
    }
    if (!writePage($ROOT, 'blog/' . $slug, (string)($body['html'] ?? ''))) out(500, ['error' => 'write_failed']);
    $posts = load($POSTS_MANIFEST);
    $posts[$slug] = $meta + ['status' => 'published', 'publishedAt' => time() * 1000];
    save($POSTS_MANIFEST, $posts);
    rebuildBlogIndex($ROOT, array_values($posts));
    out(200, ['ok' => true, 'url' => '/blog/' . $slug]);
}

if ($action === 'cleanup') {
    /* removes ONLY files this endpoint created and that aren't in keep[] */
    $keep = array_flip(array_map('strval', $body['keep'] ?? []));
    $pages = load($PAGES_MANIFEST); $removed = [];
    foreach ($pages as $rel => $info) {
        if (!isset($keep[$rel])) {
            $f = $ROOT . '/' . ($rel === '/' ? '' : $rel) . '/index.html';
            if (is_file($f)) unlink($f);
            $removed[] = $rel; unset($pages[$rel]);
        }
    }
    save($PAGES_MANIFEST, $pages);
    out(200, ['ok' => true, 'removed' => $removed]);
}

out(400, ['error' => 'unknown_action']);
