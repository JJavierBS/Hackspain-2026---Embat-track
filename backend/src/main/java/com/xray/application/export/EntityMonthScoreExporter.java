package com.xray.application.export;

import com.xray.application.ApiParams;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.SqlRunner;
import org.springframework.stereotype.Component;

import java.util.Locale;

/** entity_id,month,score for every scored month of every entity of the unit (long format). */
@Component
public class EntityMonthScoreExporter implements SubmissionExporter {

    private final SqlRunner sql;
    private final ApiParams params;

    public EntityMonthScoreExporter(SqlRunner sql, ApiParams params) {
        this.sql = sql;
        this.params = params;
    }

    @Override
    public String format() {
        return "entity-month";
    }

    @Override
    public String csv(Profile profile) {
        StringBuilder out = new StringBuilder("entity_id,month,score\n");
        sql.query("""
                SELECT entity_id, month, final FROM profile_scores
                WHERE entity_type = ? AND profile = ? AND final IS NOT NULL ORDER BY entity_id, month""",
                (rs, i) -> {
                    out.append(rs.getString(1)).append(',').append(rs.getString(2)).append(',')
                            .append(String.format(Locale.ROOT, "%.1f", rs.getDouble(3))).append('\n');
                    return null;
                },
                params.unit().name(), profile.name());
        return out.toString();
    }
}
