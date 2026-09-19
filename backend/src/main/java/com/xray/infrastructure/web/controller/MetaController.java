package com.xray.infrastructure.web.controller;

import com.xray.application.MetaQuery;
import com.xray.application.ProfilesQuery;
import com.xray.infrastructure.web.dto.MetaDto;
import com.xray.infrastructure.web.dto.ProfilesDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class MetaController {

    private final MetaQuery meta;
    private final ProfilesQuery profiles;

    public MetaController(MetaQuery meta, ProfilesQuery profiles) {
        this.meta = meta;
        this.profiles = profiles;
    }

    @GetMapping("/meta")
    public MetaDto meta() {
        return meta.meta();
    }

    @GetMapping("/profiles")
    public ProfilesDto profiles() {
        return profiles.profiles();
    }
}
