<?php
/**
 * Code Snippet: "Logistis Purge Page Cache"
 * Adds POST /wp-json/logistis/v1/purge-cache  { "pageId": 123 }
 * Called by the Logistis portal after "Ενημέρωση Σελίδας" so the public page
 * shows the new content immediately (Elementor CSS/element cache + common
 * page-cache plugins). Run it "everywhere" / front-end + REST.
 */
add_action('rest_api_init', function () {
  register_rest_route('logistis/v1', '/purge-cache', [
    'methods'  => 'POST',
    'permission_callback' => function () { return current_user_can('edit_pages'); },
    'callback' => function (WP_REST_Request $req) {
      $id = (int) $req->get_param('pageId');
      if (!$id) return new WP_Error('bad_request', 'pageId required', ['status' => 400]);
      clean_post_cache($id);
      // Elementor: drop generated CSS + element cache for this post
      if (did_action('elementor/loaded') && class_exists('\Elementor\Plugin')) {
        delete_post_meta($id, '_elementor_css');
        delete_post_meta($id, '_elementor_element_cache');
        try { \Elementor\Plugin::$instance->files_manager->clear_cache(); } catch (\Throwable $e) {}
      }
      // Page-cache plugins (whichever is installed)
      $url = get_permalink($id);
      do_action('litespeed_purge_post', $id);
      do_action('litespeed_purge_url', $url);
      if (function_exists('rocket_clean_post')) rocket_clean_post($id);
      if (function_exists('w3tc_flush_post')) w3tc_flush_post($id);
      if (function_exists('wp_cache_post_change')) wp_cache_post_change($id);
      if (function_exists('sg_cachepress_purge_cache')) sg_cachepress_purge_cache($url);
      do_action('wpfc_clear_post_cache_by_id', false, $id);
      if (class_exists('autoptimizeCache')) { \autoptimizeCache::clearall(); }
      return ['ok' => true];
    },
  ]);
});
