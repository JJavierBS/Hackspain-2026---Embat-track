package com.xray.application.export;

import com.xray.application.ApiParams;
import com.xray.application.Scores;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.SqlRunner;
import org.springframework.stereotype.Component;

import java.util.Locale;

/** entity_id,score at the last month, every entity of the unit. An entity with no score gets an empty score. */
@Component
public class EntityScoreExporter implements SubmissionExporter {

    private final SqlRunner sql;
    private final ApiParams params;

    public EntityScoreExporter(SqlRunner sql, ApiParams params) {
        this.sql = sql;
        this.params = params;
    }

    @Override
    public String format() {
        return "entity";
    }

    @Override
    public String csv(Profile profile) {
        StringBuilder out = new StringBuilder("entity_id,score\n");
        sql.query("""
                SELECT e.entity_id, p.final FROM entities e
                LEFT JOIN profile_scores p ON p.entity_type = e.entity_type AND p.entity_id = e.entity_id
                     AND p.profile = ? AND p.month = ?
                WHERE e.entity_type = ? ORDER BY e.entity_id""",
                (rs, i) -> {
                    Double v = Scores.dbl(rs, "final");
                    out.append(rs.getString("entity_id")).append(',')
                            .append(v == null ? "" : String.format(Locale.ROOT, "%.1f", v)).append('\n');
                    return null;
                },
                profile.name(), params.lastMonth(), params.unit().name());
        return out.toString();
    }
}
