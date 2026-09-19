package com.xray.application;

import com.xray.config.XRayProperties;
import com.xray.domain.model.Profile;
import com.xray.infrastructure.duckdb.DuckDbTables;
import com.xray.infrastructure.duckdb.SqlRunner;
import com.xray.infrastructure.web.dto.MetaDto;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MetaQuery {

    /** SPEC §15, shown in the UI (Spanish copy). */
    static final List<String> CAVEATS = List.of(
            "Sin balance ni cuenta de resultados: EBITDA, deuda/EBITDA y DSCR son aproximaciones desde el flujo de caja.",
            "La deuda dispuesta y concedida es una foto del 2026-09-01: los indicadores que la usan se marcan como estáticos.",
            "Datos sintéticos y sin etiqueta real de impago: la anticipación se mide contra eventos proxy documentados.",
            "Las historias cortas y los datos de ERP incompletos bajan la confianza: esas entidades se puntúan, no se excluyen.",
            "EBA/GL/2020/06 se cita como marco de buenas prácticas (alertas con umbrales y lista de vigilancia), no como lista obligatoria.");

    private final SqlRunner sql;
    private final ApiParams params;
    private final XRayProperties props;

    public MetaQuery(SqlRunner sql, ApiParams params, XRayProperties props) {
        this.sql = sql;
        this.params = params;
        this.props = props;
    }

    public MetaDto meta() {
        Map<String, Long> counts = new LinkedHashMap<>();
        if (DuckDbTables.exists(sql, "entities")) {
            sql.query("SELECT entity_type, COUNT(*) FROM entities GROUP BY 1 ORDER BY 1",
                    (rs, i) -> counts.put(rs.getString(1), rs.getLong(2)));
        }
        String runId = null;
        String finishedAt = null;
        if (DuckDbTables.exists(sql, "pipeline_runs")) {
            List<String[]> last = sql.query(
                    "SELECT run_id, CAST(finished_at AS VARCHAR) FROM pipeline_runs ORDER BY finished_at DESC LIMIT 1",
                    (rs, i) -> new String[]{rs.getString(1), rs.getString(2)});
            if (!last.isEmpty()) {
                runId = last.getFirst()[0];
                finishedAt = last.getFirst()[1];
            }
        }
        return new MetaDto(params.unit().name(), params.months(),
                Arrays.stream(Profile.values()).map(Enum::name).toList(), counts, runId, finishedAt,
                props.demoMode(), DuckDbTables.exists(sql, "contributions"),
                DuckDbTables.exists(sql, "changepoints"), CAVEATS);
    }
}
