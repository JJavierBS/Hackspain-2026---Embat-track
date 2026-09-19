package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.Month;
import com.xray.domain.model.Profile;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

/** The query parameters every read endpoint shares: profile (default BANK) and month (default the last one). */
@Component
public class ApiParams {

    private final ScoringConfig config;
    private final List<String> months;

    public ApiParams(ScoringConfig config) {
        this.config = config;
        this.months = Month.range(Month.parse(config.months().start()), Month.parse(config.months().end()))
                .stream().map(Month::toString).toList();
    }

    public EntityType unit() {
        return config.unit();
    }

    public List<String> months() {
        return months;
    }

    public String lastMonth() {
        return months.getLast();
    }

    public Profile profile(String raw) {
        if (raw == null || raw.isBlank()) {
            return Profile.BANK;
        }
        try {
            return Profile.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown profile " + raw + ". Use BANK, FUND or INSURER.");
        }
    }

    public String month(String raw) {
        if (raw == null || raw.isBlank()) {
            return lastMonth();
        }
        if (!months.contains(raw.trim())) {
            throw new BadRequestException("Month " + raw + " is outside " + months.getFirst() + " .. " + lastMonth() + ".");
        }
        return raw.trim();
    }

    /** month − k as YYYY-MM. It can fall before the first month: string comparison still orders it first. */
    public String minus(String month, int k) {
        return Month.parse(month).plus(-k).toString();
    }
}
