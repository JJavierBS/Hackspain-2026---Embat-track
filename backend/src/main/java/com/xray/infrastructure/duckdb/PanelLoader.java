package com.xray.infrastructure.duckdb;

import com.xray.domain.model.EntityKey;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Month;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.SignalId;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** indicator_values_raw and signal_values → one EntityPanel for each entity of the unit (ARCHITECTURE §3, §4.2). */
@Component
public class PanelLoader {

    private final SqlRunner sql;

    public PanelLoader(SqlRunner sql) {
        this.sql = sql;
    }

    public List<EntityPanel> load(EntityType unit, List<Month> months) {
        Map<String, Integer> monthIndex = new HashMap<>();
        for (int i = 0; i < months.size(); i++) {
            monthIndex.put(months.get(i).toString(), i);
        }

        Map<String, EntityPanel> panels = new LinkedHashMap<>();
        for (String id : sql.query(
                "SELECT entity_id FROM entities WHERE entity_type = ? ORDER BY entity_id",
                (rs, i) -> rs.getString(1), unit.name())) {
            panels.put(id, new EntityPanel(new EntityKey(unit, id), months));
        }

        List<Row> rows = sql.query("""
                SELECT entity_id, month, indicator_id, value, available, is_static, fallback
                FROM indicator_values_raw WHERE entity_type = ?""",
                (rs, i) -> new Row(rs.getString(1), rs.getString(2), rs.getString(3),
                        rs.getObject(4) == null ? null : rs.getDouble(4),
                        rs.getBoolean(5), rs.getBoolean(6), rs.getBoolean(7)),
                unit.name());

        for (Row r : rows) {
            EntityPanel panel = panels.get(r.entityId());
            if (panel == null) {
                throw new IllegalStateException("indicator_values_raw has unknown entity " + r.entityId());
            }
            Integer m = monthIndex.get(r.month());
            if (m == null) {
                continue;   // outside M00..M23
            }
            panel.setRaw(m, new RawIndicator(IndicatorId.valueOf(r.indicatorId()),
                    r.value(), r.available(), r.isStatic(), r.fallback()));
        }

        List<String[]> gaps = sql.query(
                "SELECT entity_id, month FROM entity_months WHERE entity_type = ? AND data_gap",
                (rs, i) -> new String[]{rs.getString(1), rs.getString(2)}, unit.name());
        for (String[] g : gaps) {
            Integer m = monthIndex.get(g[1]);
            if (m != null) {
                panels.get(g[0]).setDataGap(m, true);
            }
        }

        if (DuckDbTables.exists(sql, "signal_values")) {
            List<SignalRow> signals = sql.query(
                    "SELECT entity_id, month, signal_id, value FROM signal_values WHERE entity_type = ?",
                    (rs, i) -> new SignalRow(rs.getString(1), rs.getString(2), rs.getString(3),
                            rs.getObject(4) == null ? null : rs.getDouble(4)),
                    unit.name());
            for (SignalRow r : signals) {
                EntityPanel panel = panels.get(r.entityId());
                if (panel == null) {
                    throw new IllegalStateException("signal_values has unknown entity " + r.entityId());
                }
                Integer m = monthIndex.get(r.month());
                if (m == null) {
                    continue;   // outside M00..M23
                }
                panel.setSignal(SignalId.valueOf(r.signalId()), m, r.value());
            }
        }
        return new ArrayList<>(panels.values());
    }

    private record Row(String entityId, String month, String indicatorId, Double value,
                       boolean available, boolean isStatic, boolean fallback) {
    }

    private record SignalRow(String entityId, String month, String signalId, Double value) {
    }
}
