package com.xray.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xray.config.SuggestionsProperties;
import com.xray.config.XRayProperties;
import com.xray.infrastructure.web.dto.SuggestionsDto;
import com.xray.infrastructure.web.dto.SuggestionsDto.Evidence;
import com.xray.narrative.AttentionPlanner;
import com.xray.narrative.HelmcodeSuggestionRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
@ConditionalOnProperty(name = "xray.suggestions.prepare", havingValue = "true")
public class SuggestionPreparation implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SuggestionPreparation.class);
    private final JdbcTemplate jdbc;
    private final SuggestionStore store;
    private final SuggestionsProperties props;
    private final XRayProperties xray;
    private final Environment env;
    private final ObjectMapper json;

    public SuggestionPreparation(JdbcTemplate jdbc, SuggestionStore store, SuggestionsProperties props,
                                 XRayProperties xray, Environment env, ObjectMapper json) {
        this.jdbc = jdbc; this.store = store; this.props = props; this.xray = xray; this.env = env; this.json = json;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!xray.demoMode() || !"none".equals(env.getProperty("spring.main.web-application-type"))) {
            throw new IllegalStateException("S7 se prepara en un proceso sin servidor y con el pipeline desactivado");
        }
        var run = store.currentRun();
        if (!store.matches(run)) throw new IllegalStateException("S7 no puede preparar consejos: configuración no aplicada al run");
        boolean llm = env.getProperty("HELMCODE_ENABLE", Boolean.class, false);
        if (llm && props.entityIds().size() > 6) throw new IllegalArgumentException("Límite local: seis entidades por preparación IA");
        store.initialize();
        var existing = store.existing(run);
        Map<SuggestionStore.Key, List<Evidence>> grouped = new LinkedHashMap<>();
        jdbc.query("SELECT entity_type, entity_id, month, profile FROM profile_scores WHERE final IS NOT NULL ORDER BY 1,2,3,4",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> grouped.put(new SuggestionStore.Key(rs.getString(1),
                        rs.getString(2), rs.getString(3), rs.getString(4)), new ArrayList<>()));
        jdbc.query("""
                SELECT c.entity_type, c.entity_id, c.month, c.profile, v.indicator_id, v.value, v.level_score,
                       v.traj_score, c.eff_weight, v.is_static, v.fallback, v.anchor_status
                FROM contributions c JOIN indicator_values v ON c.entity_type=v.entity_type AND c.entity_id=v.entity_id
                AND c.month=v.month AND c.driver_id=v.indicator_id
                WHERE v.available AND v.indicator_id IN ('CF_IN_OUT_RATIO','DEL_OVERDUE_RECEIVABLES',
                    'PAY_SUPPLIER_LATENESS','PAY_OVERDUE_PAYABLES','ACT_COLLECTIONS_GROWTH')
                """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
            var key = new SuggestionStore.Key(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4));
            var list = grouped.get(key);
            if (list != null) list.add(new Evidence(key.month() + ":" + rs.getString(5), rs.getString(5), key.month(),
                    rs.getObject(6, Double.class), rs.getObject(7, Double.class), rs.getObject(8, Double.class),
                    rs.getDouble(9), rs.getBoolean(10), rs.getBoolean(11), rs.getString(12), ""));
        });
        var planner = new AttentionPlanner();
        var renderer = new HelmcodeSuggestionRenderer(json);
        var batch = new ArrayList<SuggestionStore.Entry>();
        int calls = 0, accepted = 0, written = 0;
        for (var row : grouped.entrySet()) {
            var key = row.getKey();
            var cached = existing.get(key);
            boolean target = llm && props.entityIds().contains(key.id()) && props.month().equals(key.month());
            if (cached != null && (!target || "helmcode".equals(cached.source()))) continue;
            var candidates = planner.plan(row.getValue(), key.month());
            String state = candidates.isEmpty() ? "NO_EVIDENCE" : "READY";
            String source = "template";
            List<String> texts = candidates.stream().map(AttentionPlanner.Candidate::text).toList();
            if (target && !candidates.isEmpty()) {
                calls++;
                var result = renderer.render(env.getProperty("HELMCODE_API_KEY"), props.model(), candidates);
                state = result.state();
                if (!result.texts().isEmpty()) { texts = result.texts(); source = "helmcode"; accepted++; }
            }
            List<SuggestionsDto.Item> items = new ArrayList<>();
            for (int i = 0; i < candidates.size(); i++) {
                var c = candidates.get(i);
                items.add(new SuggestionsDto.Item(c.id(), texts.get(i), List.of(c.evidence().ref()), c.evidence(), null));
            }
            var value = new SuggestionsDto("suggestions.v3", "atencion", state, source, run.id(),
                    "helmcode".equals(source) ? props.model() : null, Instant.now().toString(),
                    "Orden de atención por peso efectivo del indicador; en empate, peor nivel. No estima puntos recuperables. "
                            + "Investiga la viabilidad antes de actuar; regularizar pagos consume caja.", List.copyOf(items));
            batch.add(new SuggestionStore.Entry(key, value));
            written++;
            if (batch.size() >= 200) { store.save(batch, run); batch.clear(); }
        }
        store.save(batch, run);
        log.info("S7 preparado: {} fichas guardadas; {} intentos IA; {} respuestas IA aceptadas. Sin modificar scores.",
                written, calls, accepted);
    }
}
