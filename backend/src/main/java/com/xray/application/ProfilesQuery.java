package com.xray.application;

import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.ProfileWeightsDto;
import com.xray.infrastructure.web.dto.ProfilesDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The weights that produced the scores on screen (decision E1): profile_weights of the last run.
 * Before plan B merges that table does not exist, and the config is the fallback.
 */
@Service
public class ProfilesQuery {

    private final SqlRunner sql;
    private final ScoringConfig config;

    public ProfilesQuery(SqlRunner sql, ScoringConfig config) {
        this.sql = sql;
        this.config = config;
    }

    public ProfilesDto profiles() {
        List<ProfileWeightsDto> out = new ArrayList<>();
        for (Profile p : Profile.values()) {
            Map<String, Double> w = new LinkedHashMap<>();
            weights(p).entrySet().stream()
                    .sorted(Map.Entry.<Category, Double>comparingByValue().reversed())
                    .forEach(e -> w.put(e.getKey().name(), e.getValue()));
            out.add(new ProfileWeightsDto(p.name(), lambda(p), w));
        }
        return new ProfilesDto(fromRun() ? "run" : "config", out);
    }

    public Map<Category, Double> weights(Profile p) {
        Map<Category, Double> out = new EnumMap<>(Category.class);
        if (fromRun()) {
            sql.query("SELECT category, weight FROM profile_weights WHERE profile = ?",
                    (rs, i) -> out.put(Category.valueOf(rs.getString(1)), rs.getDouble(2)), p.name());
        } else {
            out.putAll(config.profiles().get(p).weights());
        }
        return out;
    }

    private double lambda(Profile p) {
        if (fromRun()) {
            List<Double> l = sql.query("SELECT ANY_VALUE(lambda) FROM profile_weights WHERE profile = ?",
                    (rs, i) -> rs.getDouble(1), p.name());
            if (!l.isEmpty()) return l.getFirst();
        }
        return config.profiles().get(p).lambda();
    }

    private boolean fromRun() {
        return DuckDbTables.exists(sql, "profile_weights");
    }
}
