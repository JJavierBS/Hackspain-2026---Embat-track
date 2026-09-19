package com.xray.application;

import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.BucketDto;
import com.xray.infrastructure.web.dto.DistributionDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** GET /api/analytics/distribution: 5-point histogram of final, status and band counts, unit entities only. */
@Service
public class DistributionQuery {

    private static final int BUCKET = 5;

    private final SqlRunner sql;
    private final ApiParams params;

    public DistributionQuery(SqlRunner sql, ApiParams params) {
        this.sql = sql;
        this.params = params;
    }

    public DistributionDto distribution(String profileRaw, String monthRaw) {
        Profile p = params.profile(profileRaw);
        String month = params.month(monthRaw);
        Object[] args = {params.unit().name(), p.name(), month};
        long[] counts = new long[100 / BUCKET];
        sql.query("""
                SELECT LEAST(CAST(FLOOR(final / 5) AS INTEGER), 19) AS b, COUNT(*) FROM profile_scores
                WHERE entity_type = ? AND profile = ? AND month = ? AND final IS NOT NULL GROUP BY 1""",
                (rs, i) -> counts[rs.getInt(1)] = rs.getLong(2), args);
        List<BucketDto> histogram = new ArrayList<>();
        for (int b = 0; b < counts.length; b++) {
            histogram.add(new BucketDto(b * BUCKET, (b + 1) * BUCKET, counts[b]));
        }
        return new DistributionDto(p.name(), month, histogram, grouped("status", args), grouped("band", args));
    }

    private Map<String, Long> grouped(String column, Object[] args) {
        Map<String, Long> out = new LinkedHashMap<>();
        sql.query("SELECT " + column + ", COUNT(*) FROM profile_scores WHERE entity_type = ? AND profile = ? "
                        + "AND month = ? AND " + column + " IS NOT NULL GROUP BY 1 ORDER BY 2 DESC",
                (rs, i) -> out.put(rs.getString(1), rs.getLong(2)), args);
        return out;
    }
}
