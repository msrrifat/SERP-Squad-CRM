<?php
/**
 * Plugin Name: SERP Squad Connector
 * Description: Companion plugin for the SERP Squad CRM — exposes the meta fields full-site deploys write (SEO title/description, Elementor data), prints them server-side, and maps them into Yoast/RankMath when present. No settings needed.
 * Version: 1.0.0
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

/* 2. Map deployed meta into Yoast SEO / RankMath when installed,
      so the SEO plugin renders the tags natively. */
add_filter('wpseo_title', function ($title) {                 // Yoast
    $t = get_post_meta(get_the_ID(), '_serpsquad_meta_title', true);
    return $t ?: $title;
});
add_filter('wpseo_metadesc', function ($desc) {
    $d = get_post_meta(get_the_ID(), '_serpsquad_meta_desc', true);
    return $d ?: $desc;
});
add_filter('rank_math/frontend/title', function ($title) {    // RankMath
    $t = get_post_meta(get_the_ID(), '_serpsquad_meta_title', true);
    return $t ?: $title;
});
add_filter('rank_math/frontend/description', function ($desc) {
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

/* 4. Optional pixel injection: define SERPSQUAD_PIXEL_SRC and _KEY in
      wp-config.php to inject the pixel site-wide without touching the theme:
      define('SERPSQUAD_PIXEL_SRC', 'https://app.serpsquad.com/px.js');
      define('SERPSQUAD_PIXEL_KEY', 'ss_live_…'); */
add_action('wp_head', function () {
    if (defined('SERPSQUAD_PIXEL_SRC') && defined('SERPSQUAD_PIXEL_KEY')) {
        printf('<script async src="%s" data-key="%s"></script>' . "\n",
            esc_url(SERPSQUAD_PIXEL_SRC), esc_attr(SERPSQUAD_PIXEL_KEY));
    }
}, 2);
