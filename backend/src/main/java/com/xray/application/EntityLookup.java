package com.xray.application;

import com.xray.infrastructure.duckdb.SqlRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/** entities row by id, or NotFoundException. */
@Component
public class EntityLookup {

    public record Entity(String id, String type, String groupId) {
    }

    private final SqlRunner sql;

    public EntityLookup(SqlRunner sql) {
        this.sql = sql;
    }

    public Entity find(String id) {
        List<Entity> found = sql.query("SELECT entity_id, entity_type, group_id FROM entities WHERE entity_id = ?",
                (rs, i) -> new Entity(rs.getString(1), rs.getString(2), rs.getString(3)), id);
        if (found.isEmpty()) throw new NotFoundException("Unknown entity " + id);
        return found.getFirst();
    }
}
