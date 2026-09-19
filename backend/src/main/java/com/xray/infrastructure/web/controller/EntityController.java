package com.xray.infrastructure.web.controller;

import com.xray.application.EntityDetailQuery;
import com.xray.application.TimelineQuery;
import com.xray.infrastructure.web.dto.EntityDetailDto;
import com.xray.infrastructure.web.dto.TimelineDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/entities")
public class EntityController {

    private final EntityDetailQuery detail;
    private final TimelineQuery timeline;

    public EntityController(EntityDetailQuery detail, TimelineQuery timeline) {
        this.detail = detail;
        this.timeline = timeline;
    }

    @GetMapping("/{id}")
    public EntityDetailDto detail(@PathVariable String id, @RequestParam(required = false) String profile,
                                  @RequestParam(required = false) String month) {
        return detail.detail(id, profile, month);
    }

    @GetMapping("/{id}/timeline")
    public TimelineDto timeline(@PathVariable String id, @RequestParam(required = false) String profile) {
        return timeline.timeline(id, profile);
    }
}
