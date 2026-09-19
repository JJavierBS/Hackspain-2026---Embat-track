package com.xray.application;

import java.util.Map;

/** Dotted paths of GET /api/config (for example indicators.PAY_DPO.anchors) on a config tree. */
final class ConfigPaths {

    private ConfigPaths() {
    }

    /** Replaces the value at an existing path. False when a key of the path does not exist. */
    @SuppressWarnings("unchecked")
    static boolean set(Map<String, Object> tree, String path, Object value) {
        String[] keys = path.split("\\.");
        Map<String, Object> node = tree;
        for (int i = 0; i < keys.length - 1; i++) {
            if (!(node.get(keys[i]) instanceof Map<?, ?> next)) return false;
            node = (Map<String, Object>) next;
        }
        if (!node.containsKey(keys[keys.length - 1])) return false;
        node.put(keys[keys.length - 1], value);
        return true;
    }

    /** The value at a path, or null. */
    static Object get(Map<String, Object> tree, String path) {
        Object node = tree;
        for (String k : path.split("\\.")) {
            if (!(node instanceof Map<?, ?> m)) return null;
            node = m.get(k);
        }
        return node;
    }
}
