<?php
/**
 * Plugin Name: SERP Squad Connector
 * Description: Companion plugin for the SERP Squad CRM — exposes the meta fields full-site deploys write (SEO title/description, Elementor data), prints them server-side, and maps them into Yoast/RankMath when present. No settings needed.
 * Version: 1.1.1
 * Author: SERP Squad
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) exit;

/* 1. Register the meta keys so the REST API (Application Password auth)
      can write them — WordPress silently drops unregistered meta. */
add_action('init', function () {
    foreach (['page', 'post'] as $type) {
        register_post_meta($type, '_serpsquad_meta_title', [
            'show_in_rest' => true, 'single' => true, 'type' => 'string',
            'auth_callback' => function () { return current_user_can('edit_posts'); },
        ]);
        register_post_meta($type, '_serpsquad_meta_desc', [
            'show_in_rest' => true, 'single' => true, 'type' => 'string',
            'auth_callback' => function () { return current_user_can('edit_posts'); },
        ]);
    }
    /* Elementor stores its layout in _elementor_data; expose it for deploys
       (only when Elementor is active — otherwise pages use the HTML fallback). */
    if (defined('ELEMENTOR_VERSION')) {
        foreach (['page', 'post'] as $type) {
            register_post_meta($type, '_elementor_data', [
                'show_in_rest' => true, 'single' => true, 'type' => 'string',
                'auth_callback' => function () { return current_user_can('edit_posts'); },
            ]);
            register_post_meta($type, '_elementor_edit_mode', [
                'show_in_rest' => true, 'single' => true, 'type' => 'string',
                'auth_callback' => function () { return current_user_can('edit_posts'); },
            ]);
        }
    }
});

/* 1b. Copy deployed meta STRAIGHT INTO Yoast/RankMath storage the moment the
       CRM writes it — then the SEO plugin owns the value everywhere: frontend
       tags, sitemaps, and the REST head the CRM reads back on recrawl. */
$serpsquad_sync_meta = function ($meta_id, $post_id, $meta_key, $value) {
    if ($meta_key === '_serpsquad_meta_title' && $value !== '') {
        if (defined('WPSEO_VERSION'))  update_post_meta($post_id, '_yoast_wpseo_title', $value);
        if (class_exists('RankMath'))  update_post_meta($post_id, 'rank_math_title', $value);
    }
    if ($meta_key === '_serpsquad_meta_desc' && $value !== '') {
        if (defined('WPSEO_VERSION'))  update_post_meta($post_id, '_yoast_wpseo_metadesc', $value);
        if (class_exists('RankMath'))  update_post_meta($post_id, 'rank_math_description', $value);
    }
};
add_action('added_post_meta',   $serpsquad_sync_meta, 10, 4);
add_action('updated_post_meta', $serpsquad_sync_meta, 10, 4);

/* 1c. Uniform read-back for the CRM crawler: the REAL per-post SEO title/desc
       regardless of which SEO plugin the site runs (Yoast, RankMath, or our
       own fields). Template values ("%%title%%…") are skipped — the CRM falls
       back to the rendered head / post title for those. */
add_action('rest_api_init', function () {
    $literal = function ($v) { return (is_string($v) && $v !== '' && strpos($v, '%') === false) ? $v : ''; };
    $get = function ($post) use ($literal) {
        $id = $post['id'];
        $title = $literal(get_post_meta($id, '_yoast_wpseo_title', true))
            ?: $literal(get_post_meta($id, 'rank_math_title', true))
            ?: $literal(get_post_meta($id, '_serpsquad_meta_title', true));
        $desc = $literal(get_post_meta($id, '_yoast_wpseo_metadesc', true))
            ?: $literal(get_post_meta($id, 'rank_math_description', true))
            ?: $literal(get_post_meta($id, '_serpsquad_meta_desc', true));
        return ['title' => $title, 'desc' => $desc];
    };
    foreach (['page', 'post'] as $type) {
        register_rest_field($type, 'serpsquad_seo', ['get_callback' => $get, 'schema' => null]);
    }
});

/* 2. Map deployed meta into Yoast SEO / RankMath when installed,
      so the SEO plugin renders the tags natively (singular views only —
      archives/home must keep their own titles). */
add_filter('wpseo_title', function ($title) {                 // Yoast
    if (!is_singular()) return $title;
    $t = get_post_meta(get_the_ID(), '_serpsquad_meta_title', true);
    return $t ?: $title;
});
add_filter('wpseo_metadesc', function ($desc) {
    if (!is_singular()) return $desc;
    $d = get_post_meta(get_the_ID(), '_serpsquad_meta_desc', true);
    return $d ?: $desc;
});
add_filter('rank_math/frontend/title', function ($title) {    // RankMath
    if (!is_singular()) return $title;
    $t = get_post_meta(get_the_ID(), '_serpsquad_meta_title', true);
    return $t ?: $title;
});
add_filter('rank_math/frontend/description', function ($desc) {
    if (!is_singular()) return $desc;
    $d = get_post_meta(get_the_ID(), '_serpsquad_meta_desc', true);
    return $d ?: $desc;
});

/* 3. No SEO plugin? Print the tags natively. */
add_action('wp_head', function () {
    if (defined('WPSEO_VERSION') || class_exists('RankMath')) return; // SEO plugin owns the head
    if (!is_singular()) return;
    $d = get_post_meta(get_the_ID(), '_serpsquad_meta_desc', true);
    if ($d) printf('<meta name="description" content="%s">' . "\n", esc_attr($d));
}, 1);
add_filter('pre_get_document_title', function ($title) {
    if (defined('WPSEO_VERSION') || class_exists('RankMath')) return $title;
    if (!is_singular()) return $title;
    $t = get_post_meta(get_the_ID(), '_serpsquad_meta_title', true);
    return $t ?: $title;
});

/* 4. Pixel injection, two ways — no theme editing needed either way:
      a) REMOTE (one-click from the CRM): the CRM writes the two options
         below through /wp/v2/settings using the same Application Password.
      b) MANUAL: define SERPSQUAD_PIXEL_SRC and _KEY in wp-config.php
         (defines win over options when both are present). */
add_action('init', function () {
    register_setting('general', 'serpsquad_pixel_src', [
        'show_in_rest' => true, 'type' => 'string', 'default' => '',
        'sanitize_callback' => 'esc_url_raw',
    ]);
    register_setting('general', 'serpsquad_pixel_key', [
        'show_in_rest' => true, 'type' => 'string', 'default' => '',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
});
add_action('wp_head', function () {
    $src = defined('SERPSQUAD_PIXEL_SRC') ? SERPSQUAD_PIXEL_SRC : get_option('serpsquad_pixel_src');
    $key = defined('SERPSQUAD_PIXEL_KEY') ? SERPSQUAD_PIXEL_KEY : get_option('serpsquad_pixel_key');
    if ($src && $key) {
        /* nowprocket + data-cfasync: WP Rocket / Rocket Loader must not
           re-host or delay the pixel — that breaks hit reporting */
        printf('<script async src="%s" data-key="%s" nowprocket data-cfasync="false"></script>' . "\n",
            esc_url($src), esc_attr($key));
    }
}, 2);

/* ======================================================================
   5. OUTBOUND AGENT — the way in when the site's firewall blocks us.

   Cloudflare (and hosting WAFs, and security plugins) filter traffic coming
   INTO the site. When they refuse the CRM's server, nothing the CRM sends can
   reach WordPress — not /wp-json, not /?rest_route=, and not any route this
   plugin could add, because every one of those is still an inbound request
   arriving at the same edge.

   What is never filtered is the site calling OUT. So the direction is
   reversed: this plugin contacts the CRM on a schedule, asks whether there is
   work queued for it, does the work locally with the privileges it already
   has, and posts the answer back. The firewall sees ordinary outbound HTTPS
   from the site itself.

   It also removes the Application Password from the picture entirely: the
   plugin acts as itself, so there is no credential to store, leak or rotate.

   Requests are signed with a shared secret issued at pairing (HMAC-SHA256
   over timestamp + body) and timestamps are checked, so a replayed or forged
   request is rejected.
   ====================================================================== */

define('SERPSQUAD_AGENT_VERSION', '2.0.0');
if (!defined('SERPSQUAD_API')) define('SERPSQUAD_API', 'https://app.serpsquad.com');

function serpsquad_agent_creds() {
    $id = get_option('serpsquad_site_id', '');
    $secret = get_option('serpsquad_site_secret', '');
    return ($id && $secret) ? [$id, $secret] : null;
}

/* signed outbound call to the CRM */
function serpsquad_agent_post($path, $payload) {
    $creds = serpsquad_agent_creds();
    if (!$creds) return new WP_Error('unpaired', 'This site is not paired with the CRM yet.');
    list($id, $secret) = $creds;
    $body = wp_json_encode($payload);
    $ts   = (string) time();
    $sig  = hash_hmac('sha256', $ts . '.' . $body, $secret);
    $res  = wp_remote_post(SERPSQUAD_API . $path, [
        'timeout' => 30,
        'headers' => [
            'Content-Type'      => 'application/json',
            'X-SS-Site'         => $id,
            'X-SS-Timestamp'    => $ts,
            'X-SS-Signature'    => $sig,
            'X-SS-Agent'        => SERPSQUAD_AGENT_VERSION,
        ],
        'body' => $body,
    ]);
    if (is_wp_error($res)) return $res;
    $code = wp_remote_retrieve_response_code($res);
    $json = json_decode(wp_remote_retrieve_body($res), true);
    if ($code < 200 || $code >= 300) {
        return new WP_Error('crm_http_' . $code, isset($json['detail']) ? $json['detail'] : ('CRM returned HTTP ' . $code));
    }
    return is_array($json) ? $json : [];
}

/* ---- the commands the CRM can ask this site to run ---- */

/* everything the CRM's content sync needs, gathered locally */
function serpsquad_agent_collect($args = []) {
    $out = ['pages' => [], 'posts' => []];
    foreach (['page' => 'pages', 'post' => 'posts'] as $type => $bucket) {
        $q = new WP_Query([
            'post_type' => $type, 'post_status' => 'publish',
            'posts_per_page' => isset($args['limit']) ? (int) $args['limit'] : 200,
            'no_found_rows' => true, 'ignore_sticky_posts' => true,
        ]);
        foreach ($q->posts as $p) {
            $title = get_post_meta($p->ID, '_yoast_wpseo_title', true)
                ?: get_post_meta($p->ID, 'rank_math_title', true)
                ?: get_post_meta($p->ID, '_serpsquad_meta_title', true);
            $desc = get_post_meta($p->ID, '_yoast_wpseo_metadesc', true)
                ?: get_post_meta($p->ID, 'rank_math_description', true)
                ?: get_post_meta($p->ID, '_serpsquad_meta_desc', true);
            $out[$bucket][] = [
                'id'        => $p->ID,
                'slug'      => $p->post_name,
                'link'      => get_permalink($p),
                'title'     => ['rendered' => get_the_title($p)],
                'excerpt'   => ['rendered' => get_the_excerpt($p)],
                'content'   => ['rendered' => apply_filters('the_content', $p->post_content)],
                'modified'  => mysql2date('c', $p->post_modified_gmt),
                'date'      => mysql2date('c', $p->post_date_gmt),
                /* same shape the REST reader already understands, so the CRM
                   parses an agent payload with the code it already has */
                'serpsquad_seo' => [
                    'title' => (is_string($title) && strpos($title, '%') === false) ? $title : '',
                    'desc'  => (is_string($desc) && strpos($desc, '%') === false) ? $desc : '',
                ],
            ];
        }
        wp_reset_postdata();
    }
    return $out;
}

/* the media library, for the CRM's image picker */
function serpsquad_agent_media($args = []) {
    $q = new WP_Query([
        'post_type' => 'attachment', 'post_status' => 'inherit',
        'posts_per_page' => isset($args['limit']) ? (int) $args['limit'] : 500,
        'no_found_rows' => true,
    ]);
    $out = [];
    foreach ($q->posts as $m) {
        $out[] = [
            'id' => $m->ID, 'source_url' => wp_get_attachment_url($m->ID),
            'title' => ['rendered' => get_the_title($m)],
            'alt_text' => get_post_meta($m->ID, '_wp_attachment_image_alt', true),
            'media_type' => wp_attachment_is_image($m->ID) ? 'image' : 'file',
            'mime_type' => get_post_mime_type($m->ID),
            'date' => mysql2date('c', $m->post_date_gmt),
        ];
    }
    wp_reset_postdata();
    return $out;
}

/* create or update a page/post — the deploy path, run locally */
function serpsquad_agent_upsert($a) {
    $slug = isset($a['slug']) ? sanitize_title($a['slug']) : '';
    if (!$slug) return ['error' => 'slug required'];
    $type = (isset($a['type']) && $a['type'] === 'post') ? 'post' : 'page';
    $existing = get_page_by_path($slug, OBJECT, $type);
    $data = [
        'post_type'    => $type,
        'post_name'    => $slug,
        'post_title'   => isset($a['title']) ? wp_strip_all_tags($a['title']) : '',
        'post_content' => isset($a['content']) ? $a['content'] : '',
        'post_status'  => isset($a['status']) ? $a['status'] : 'publish',
    ];
    if ($existing) { $data['ID'] = $existing->ID; $id = wp_update_post($data, true); }
    else { $id = wp_insert_post($data, true); }
    if (is_wp_error($id)) return ['error' => $id->get_error_message()];
    if (!empty($a['metaTitle'])) update_post_meta($id, '_serpsquad_meta_title', $a['metaTitle']);
    if (!empty($a['metaDesc']))  update_post_meta($id, '_serpsquad_meta_desc', $a['metaDesc']);
    if (!empty($a['elementor'])) {
        update_post_meta($id, '_elementor_data', $a['elementor']);
        update_post_meta($id, '_elementor_edit_mode', 'builder');
    }
    return ['id' => $id, 'link' => get_permalink($id), 'slug' => $slug];
}

function serpsquad_agent_run($cmd) {
    $a = isset($cmd['args']) && is_array($cmd['args']) ? $cmd['args'] : [];
    switch (isset($cmd['op']) ? $cmd['op'] : '') {
        case 'ping':    return ['ok' => true, 'wp' => get_bloginfo('version'), 'home' => home_url(), 'agent' => SERPSQUAD_AGENT_VERSION];
        case 'content': return serpsquad_agent_collect($a);
        case 'media':   return serpsquad_agent_media($a);
        case 'upsert':  return serpsquad_agent_upsert($a);
        case 'option':
            if (empty($a['name'])) return ['error' => 'name required'];
            /* only this plugin's own options may be written from the CRM */
            if (strpos($a['name'], 'serpsquad_') !== 0) return ['error' => 'not a SERP Squad option'];
            update_option($a['name'], isset($a['value']) ? $a['value'] : '');
            return ['ok' => true];
        default: return ['error' => 'unknown op'];
    }
}

/* ask the CRM for work, do it, hand back the answers */
function serpsquad_agent_tick() {
    if (!serpsquad_agent_creds()) return;
    $poll = serpsquad_agent_post('/api/wp/agent/poll', ['home' => home_url()]);
    if (is_wp_error($poll) || empty($poll['commands'])) return;
    $results = [];
    foreach ($poll['commands'] as $cmd) {
        if (empty($cmd['id'])) continue;
        try { $results[] = ['id' => $cmd['id'], 'result' => serpsquad_agent_run($cmd)]; }
        catch (Throwable $e) { $results[] = ['id' => $cmd['id'], 'result' => ['error' => $e->getMessage()]]; }
    }
    if ($results) serpsquad_agent_post('/api/wp/agent/result', ['results' => $results]);
}
add_action('serpsquad_agent_cron', 'serpsquad_agent_tick');

/* Every minute, so a sync started in the CRM lands quickly. WP-Cron only runs
   on traffic, so a quiet site can lag — the CRM says so rather than pretending
   the sync failed. */
add_filter('cron_schedules', function ($s) {
    $s['serpsquad_minute'] = ['interval' => 60, 'display' => 'Every minute (SERP Squad)'];
    return $s;
});
register_activation_hook(__FILE__, function () {
    if (!wp_next_scheduled('serpsquad_agent_cron')) wp_schedule_event(time() + 30, 'serpsquad_minute', 'serpsquad_agent_cron');
});
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('serpsquad_agent_cron'); });
add_action('init', function () {
    if (serpsquad_agent_creds() && !wp_next_scheduled('serpsquad_agent_cron')) {
        wp_schedule_event(time() + 30, 'serpsquad_minute', 'serpsquad_agent_cron');
    }
});

/* ---- pairing screen: Settings → SERP Squad ---- */
add_action('admin_menu', function () {
    add_options_page('SERP Squad', 'SERP Squad', 'manage_options', 'serpsquad', function () {
        if (!current_user_can('manage_options')) return;
        $notice = '';
        if (isset($_POST['serpsquad_key']) && check_admin_referer('serpsquad_pair')) {
            $key = sanitize_text_field(wp_unslash($_POST['serpsquad_key']));
            if ($key === 'disconnect') {
                delete_option('serpsquad_site_id'); delete_option('serpsquad_site_secret');
                $notice = '<div class="notice notice-warning"><p>Disconnected from the CRM.</p></div>';
            } else {
                $res = wp_remote_post(SERPSQUAD_API . '/api/wp/agent/pair', [
                    'timeout' => 30, 'headers' => ['Content-Type' => 'application/json'],
                    'body' => wp_json_encode(['key' => $key, 'home' => home_url(), 'agent' => SERPSQUAD_AGENT_VERSION]),
                ]);
                $j = is_wp_error($res) ? null : json_decode(wp_remote_retrieve_body($res), true);
                if (!is_wp_error($res) && !empty($j['siteId']) && !empty($j['secret'])) {
                    update_option('serpsquad_site_id', $j['siteId']);
                    update_option('serpsquad_site_secret', $j['secret']);
                    if (!wp_next_scheduled('serpsquad_agent_cron')) wp_schedule_event(time() + 5, 'serpsquad_minute', 'serpsquad_agent_cron');
                    serpsquad_agent_tick();
                    $notice = '<div class="notice notice-success"><p>Connected. This site now syncs to the CRM by calling out, so a firewall blocking inbound requests no longer matters.</p></div>';
                } else {
                    $msg = is_wp_error($res) ? $res->get_error_message() : (isset($j['detail']) ? $j['detail'] : 'the key was not accepted');
                    $notice = '<div class="notice notice-error"><p>Pairing failed: ' . esc_html($msg) . '</p></div>';
                }
            }
        }
        $creds = serpsquad_agent_creds();
        echo '<div class="wrap"><h1>SERP Squad</h1>' . $notice;
        if ($creds) {
            echo '<p><strong>Connected.</strong> Site ID <code>' . esc_html($creds[0]) . '</code></p>';
            echo '<p>This site checks the CRM for work once a minute and reports back. No inbound access is required, so no firewall or Cloudflare change is needed.</p>';
            echo '<form method="post">' . wp_nonce_field('serpsquad_pair', '_wpnonce', true, false)
               . '<input type="hidden" name="serpsquad_key" value="disconnect">'
               . '<p><button class="button">Disconnect</button></p></form>';
        } else {
            echo '<p>Paste the connection key from the CRM (Optimization Studio → Business Website → Connector).</p>';
            echo '<form method="post">' . wp_nonce_field('serpsquad_pair', '_wpnonce', true, false)
               . '<p><input type="text" name="serpsquad_key" class="regular-text" placeholder="ssk_…" required></p>'
               . '<p><button class="button button-primary">Connect</button></p></form>';
        }
        echo '</div>';
    });
});
