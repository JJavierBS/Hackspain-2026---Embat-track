package com.xray.infrastructure.web.controller;

import com.xray.application.MethodologyQuery;
import com.xray.infrastructure.web.dto.MethodologyDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/methodology")
public class MethodologyController {

    private final MethodologyQuery methodology;

    public MethodologyController(MethodologyQuery methodology) {
        this.methodology = methodology;
    }

    @GetMapping
    public MethodologyDto methodology() {
        return methodology.methodology();
    }
}
