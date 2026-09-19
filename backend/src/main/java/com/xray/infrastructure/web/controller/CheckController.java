package com.xray.infrastructure.web.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Liveness check: 200 OK with no work behind it. /api/check is the same route through the nginx /api proxy. */
@RestController
public class CheckController {

    @GetMapping({"/check", "/api/check"})
    public ResponseEntity<String> check() {
        return ResponseEntity.ok("OK");
    }
}
