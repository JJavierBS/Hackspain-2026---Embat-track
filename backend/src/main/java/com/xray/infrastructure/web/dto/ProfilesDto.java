package com.xray.infrastructure.web.dto;

import java.util.List;

/** source = "run" (profile_weights of the last run) or "config" (scoring-config.yml, before plan B merges). */
public record ProfilesDto(String source, List<ProfileWeightsDto> profiles) {
}
