package com.xray.application;

import com.xray.config.IndicatorConfig;
import com.xray.config.ScoringConfig;
import com.xray.domain.model.Category;
import com.xray.domain.model.CategoryScore;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.EntityType;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Month;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.SubScore;
import com.xray.infrastructure.duckdb.PanelLoader;
import com.xray.infrastructure.web.dto.TuningDto;
import com.xray.infrastructure.web.dto.TuningRequest;
import com.xray.pipeline.stages.PanelScoring;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * POST /api/entities/{id}/tuning (docs/SECTOR_PRESETS.md): a what-if score for ONE entity with a sector preset
 * and/or the Algorithm page draft. The request reads the entity's stored raw indicators (indicator_values_raw)
 * and runs the pipeline's own scoring steps (PanelScoring) twice: with the active config (the base) and with the
 * tuned config. Both runs use the same code, so the difference comes from the config only. It writes nothing,
 * and no other entity or page changes: this is the second request that computes, like the limit simulator.
 * Causality holds: the scoring steps are causal per month (LookAheadTest).
 */
@Service
public class EntityTuningUseCase {

    private final ApiParams params;
    private final EntityLookup lookup;
    private final PanelLoader loader;
    private final ScoringConfig active;
    private final AlgorithmConfigUseCase configs;
    private final SectorCatalog sectors;

    public EntityTuningUseCase(ApiParams params, EntityLookup lookup, PanelLoader loader, ScoringConfig active,
                               AlgorithmConfigUseCase configs, SectorCatalog sectors) {
        this.params = params;
        this.lookup = lookup;
        this.loader = loader;
        this.active = active;
        this.configs = configs;
        this.sectors = sectors;
    }

    public TuningDto tune(String id, TuningRequest body) {
        TuningRequest req = body == null ? new TuningRequest(null, null, null, null, null) : body;
        Profile profile = params.profile(req.profile());
        String month = params.month(req.month());
        String sectorId = req.sector() == null || req.sector().isBlank() ? null : req.sector().trim();
        boolean draft = req.config() != null && !req.config().isEmpty();

        Map<String, Object> tree = configs.mergedTree(draft ? req.config() : null);
        Map<?, ?> sector = null;
        List<String> applied = List.of();
        List<String> sectorIndicators = List.of();
        if (sectorId != null) {
            sector = sectors.find(sectorId);
            sectorIndicators = sectors.indicators(sectorId);
            applied = sectors.applyTo(tree, sectorId, req.sectorIndicators());
        }
        ScoringConfig tunedConfig = configs.toConfig(tree);

        EntityLookup.Entity e = lookup.find(id);
        EntityType type = EntityType.valueOf(e.type());
        List<Month> months = params.months().stream().map(Month::parse).toList();
        EntityPanel base = one(type, id, months);
        EntityPanel tuned = one(type, id, months);
        PanelScoring.scoreAll(base, active);
        PanelScoring.scoreAll(tuned, tunedConfig);
        int m = params.months().indexOf(month);

        List<TuningDto.ProfileRow> profiles = new ArrayList<>();
        for (Profile p : Profile.values()) {
            profiles.add(new TuningDto.ProfileRow(p.name(), point(base.profileScores(p)[m]),
                    point(tuned.profileScores(p)[m])));
        }

        List<TuningDto.SeriesPoint> series = new ArrayList<>();
        ProfileScore[] bs = base.profileScores(profile);
        ProfileScore[] ts = tuned.profileScores(profile);
        for (int i = 0; i < months.size(); i++) {
            series.add(new TuningDto.SeriesPoint(params.months().get(i), Scores.round1(bs[i].finalScore()),
                    Scores.round1(ts[i].finalScore())));
        }

        List<TuningDto.CategoryRow> categories = new ArrayList<>();
        Map<Category, Double> baseWeights = active.profiles().get(profile).weights();
        Map<Category, Double> tunedWeights = tunedConfig.profiles().get(profile).weights();
        for (Category c : Category.values()) {
            if (c == Category.MOMENTUM) continue;
            CategoryScore b = base.categoryScores(c)[m];
            CategoryScore t = tuned.categoryScores(c)[m];
            categories.add(new TuningDto.CategoryRow(c.name(), baseWeights.getOrDefault(c, 0.0),
                    tunedWeights.getOrDefault(c, 0.0), Scores.round1(b.level()), Scores.round1(t.level())));
        }

        List<TuningDto.IndicatorRow> indicators = new ArrayList<>();
        for (IndicatorId ind : IndicatorId.values()) {
            IndicatorConfig bc = active.indicators().get(ind);
            IndicatorConfig tc = tunedConfig.indicators().get(ind);
            boolean same = Objects.equals(bc.anchors(), tc.anchors()) && bc.weightOrDefault() == tc.weightOrDefault();
            if (same && !sectorIndicators.contains(ind.name())) continue;
            RawIndicator raw = base.raw(ind, m);
            SubScore b = base.subScores(ind)[m];
            SubScore t = tuned.subScores(ind)[m];
            indicators.add(new TuningDto.IndicatorRow(ind.name(), bc.category().name(), raw.available(),
                    raw.value(), b.available() ? Scores.round1(b.level()) : null,
                    t.available() ? Scores.round1(t.level()) : null, bc.anchors(), tc.anchors()));
        }

        TuningDto.SectorRef ref = sector == null ? null
                : new TuningDto.SectorRef(sectorId, String.valueOf(sector.get("name")), applied);
        return new TuningDto(id, e.type(), month, profile.name(), ref, draft, profiles, series, categories, indicators);
    }

    private EntityPanel one(EntityType type, String id, List<Month> months) {
        List<EntityPanel> panels = loader.loadOne(type, id, months);
        if (panels.isEmpty()) throw new NotFoundException("No indicators for " + id);
        return panels.getFirst();
    }

    private static TuningDto.Point point(ProfileScore s) {
        return new TuningDto.Point(Scores.round1(s.finalScore()), Scores.round1(s.level()), Scores.round1(s.traj()),
                s.band() == null ? null : s.band().name());
    }
}
