<?php
/**
 * Plugin Name: SERP Squad Connector
 * Description: Companion plugin for the SERP Squad CRM — exposes the meta fields full-site deploys write (SEO title/description, Elementor data), prints them server-side, and maps them into Yoast/RankMath when present. No settings needed.
 * Version: 1.1.0
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
        printf('<script async src="%s" data-key="%s"></script>' . "\n",
            esc_url($src), esc_attr($key));
    }
}, 2);
