package com.xray.config;

import com.xray.domain.model.Category;
import com.xray.domain.model.HealthStatus;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.Profile;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ScoringConfigValidationTest {

    private static ScoringConfig base;

    @BeforeAll
    static void loadShippedConfig() throws IOException {
        var sources = new YamlPropertySourceLoader()
                .load("scoring-config", new ClassPathResource("scoring-config.yml"));
        base = new Binder(ConfigurationPropertySources.from(sources))
                .bind("scoring", ScoringConfig.class).get();
    }

    @Test
    void shippedConfigBindsEveryIndicatorAndProfile() {
        assertEquals(IndicatorId.values().length, base.indicators().size());
        assertEquals(Profile.values().length, base.profiles().size());
        assertEquals(100.0, base.debtDscr().noDebtLevel());
        assertEquals(0.0, base.levDebtToCf().nonPositiveCfLevel());
        assertNotNull(base.momentum());
        assertTrue(base.concentration().minCounterpartyCoverage() > 0);
    }

    @Test
    void emptyAnchorsFail() {
        var ind = new EnumMap<>(base.indicators());
        var cf = ind.get(IndicatorId.CF_VOLATILITY);
        ind.put(IndicatorId.CF_VOLATILITY,
                new IndicatorConfig(cf.category(), cf.method(), cf.status(), cf.source(), List.of(), cf.weight()));
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(ind, base.profiles()));
        assertTrue(ex.getMessage().contains("CF_VOLATILITY"), ex.getMessage());
    }

    @Test
    void nonMonotonicAnchorsFail() {
        var ind = new EnumMap<>(base.indicators());
        var lr = ind.get(IndicatorId.LIQ_RUNWAY);
        ind.put(IndicatorId.LIQ_RUNWAY, new IndicatorConfig(lr.category(), lr.method(), lr.status(), lr.source(),
                List.of(List.of(0.0, 0.0), List.of(3.0, 50.0), List.of(1.0, 20.0)), lr.weight()));
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(ind, base.profiles()));
        assertTrue(ex.getMessage().contains("LIQ_RUNWAY"), ex.getMessage());
    }

    @Test
    void missingIndicatorFails() {
        var ind = new EnumMap<>(base.indicators());
        ind.remove(IndicatorId.TAX_REGULARITY);
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(ind, base.profiles()));
        assertTrue(ex.getMessage().contains("TAX_REGULARITY"), ex.getMessage());
    }

    @Test
    void weightsNotSummingTo100Fail() {
        var prof = new EnumMap<>(base.profiles());
        var bank = prof.get(Profile.BANK);
        var w = new EnumMap<>(bank.weights());
        w.put(Category.DEBT_SERVICE, 30.0);
        prof.put(Profile.BANK, new ProfileConfig(bank.lambda(), w));
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(base.indicators(), prof));
        assertTrue(ex.getMessage().contains("BANK"), ex.getMessage());
    }

    @Test
    void shippedConfigBindsDataRules() {
        DataRules r = base.dataRules();
        assertNotNull(r);
        assertNotNull(r.fxConvention());
        assertNotNull(r.fxTarget());
        assertEquals(1.0, r.fxToEur().get("EUR"));
        assertNotNull(r.invoiceDirection());
        assertTrue(r.invoiceIssuedSign() == 1 || r.invoiceIssuedSign() == -1);
        assertFalse(r.invoicePaidStatusValues().isEmpty());
        assertNotNull(r.intragroupRule());
        assertTrue(r.intragroupMaxLagDays() >= 0);
        assertEquals(List.of("interest_charge"), r.interestCategories());
        assertFalse(r.creditLineDebtTypes().isEmpty());
        assertEquals(6, base.windows().annualizeMinMonths());
        assertTrue(base.taxRegularity().monthlyCadenceMonths() < base.taxRegularity().quarterlyCadenceMonths());
    }

    @Test
    void phase4KeysBind() {
        assertEquals(6, base.regimes().baselineMonths());
        assertTrue(base.regimes().baselineMinPoints() <= base.regimes().baselineMonths());
        assertTrue(base.regimes().sigmaFloor() > 0);
        assertEquals(List.of(IndicatorId.CF_NOCF_MARGIN, IndicatorId.PAY_DSO, IndicatorId.LIQ_RUNWAY),
                base.regimes().cusumIndicators());
        assertTrue(base.statuses().criticalBelow() < base.statuses().healthyMinFinal());
        assertTrue(base.confidence().lowHistoryMonths() < base.confidence().mediumHistoryMonths());
        assertTrue(base.explanation().narrativeTopN() > 0);
        assertTrue(base.indicators().values().stream().allMatch(ic -> ic.weightOrDefault() > 0));
    }

    @Test
    void nonPositiveIndicatorWeightFails() {
        var ind = new EnumMap<>(base.indicators());
        var ds = ind.get(IndicatorId.PAY_DSO);
        ind.put(IndicatorId.PAY_DSO,
                new IndicatorConfig(ds.category(), ds.method(), ds.status(), ds.source(), ds.anchors(), 0.0));
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(ind, base.profiles()));
        assertTrue(ex.getMessage().contains("PAY_DSO"), ex.getMessage());
    }

    @Test
    void phase5KeysBind() {
        assertNotNull(base.products().limitProfile());
        assertNotNull(base.products().premiumProfile());
        assertNotNull(base.products().momentumProfile());
        assertTrue(base.limitEngine().roundingEur() > 0);
        assertTrue(base.alerts().runwayLow().critical() < base.alerts().runwayLow().warn());
        assertTrue(base.alerts().scoreDrop().critical() > base.alerts().scoreDrop().warn());
        assertTrue(base.alerts().watchlist().minCritical() >= 1);
        assertTrue(base.alerts().driftBaselineMinPoints() <= base.alerts().driftBaselineMonths());
    }

    @Test
    void invertedAlertLevelsFail() {
        var a = base.alerts();
        var bad = new ScoringConfig.AlertsConfig(new ScoringConfig.Level(1.0, 3.0), a.dscrBreach(), a.lineUtilHigh(),
                a.dsoDrift(), a.supplierLatenessUp(), a.overdueReceivables(), a.taxGap(), a.concentrationHigh(),
                a.factoringSpike(), a.scoreDrop(), a.scoreDropMonths(), a.driftBaselineMonths(),
                a.driftBaselineMinPoints(), a.bandDowngradeCriticalSteps(), a.watchlist());
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(base.indicators(), base.profiles(), bad));
        assertTrue(ex.getMessage().contains("runway-low"), ex.getMessage());
    }

    @Test
    void phase6KeysBind() {
        var lt = base.leadTime();
        assertEquals(6, lt.minHistoryMonths());
        assertEquals(12, lt.windowMonths());
        assertEquals(6, lt.horizonMonths());
        assertEquals(1.5, lt.events().runwayBelow());
        assertEquals(65.0, lt.events().improvementCross());
        assertTrue(lt.signal().deteriorationStatuses().contains(HealthStatus.TURNING));
        assertEquals(35.0, lt.signal().deteriorationMaxTraj());
        assertEquals(3.0, base.showcase().maxFinalGap());
        assertEquals(10, base.showcase().topN());
    }

    private static ScoringConfig copyWith(Map<IndicatorId, IndicatorConfig> ind, Map<Profile, ProfileConfig> prof) {
        return copyWith(ind, prof, base.alerts());
    }

    private static ScoringConfig copyWith(Map<IndicatorId, IndicatorConfig> ind, Map<Profile, ProfileConfig> prof,
                                          ScoringConfig.AlertsConfig alerts) {
        return new ScoringConfig(base.unit(), base.months(), base.cashProductTypes(), base.semiLiquidTypes(),
                base.bookedStatusValues(), base.runwayCapMonths(), base.trajectory(), base.flowClasses(),
                base.defaultFlowClass(), base.otherSignFallback(), ind, prof, base.regimes(), base.bands(),
                base.limitEngine(), base.insurer(), base.debtDscr(), base.dataRules(),
                base.levDebtToCf(), base.momentum(), base.concentration(), base.windows(), base.taxRegularity(),
                base.statuses(), base.confidence(), base.explanation(), base.products(), alerts,
                base.leadTime(), base.showcase());
    }
}
