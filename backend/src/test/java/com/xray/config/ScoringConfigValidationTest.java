package com.xray.config;

import com.xray.domain.model.Category;
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
    }

    @Test
    void emptyAnchorsFail() {
        var ind = new EnumMap<>(base.indicators());
        var cf = ind.get(IndicatorId.CF_VOLATILITY);
        ind.put(IndicatorId.CF_VOLATILITY,
                new IndicatorConfig(cf.category(), cf.method(), cf.status(), cf.source(), List.of()));
        var ex = assertThrows(IllegalStateException.class, () -> copyWith(ind, base.profiles()));
        assertTrue(ex.getMessage().contains("CF_VOLATILITY"), ex.getMessage());
    }

    @Test
    void nonMonotonicAnchorsFail() {
        var ind = new EnumMap<>(base.indicators());
        var lr = ind.get(IndicatorId.LIQ_RUNWAY);
        ind.put(IndicatorId.LIQ_RUNWAY, new IndicatorConfig(lr.category(), lr.method(), lr.status(), lr.source(),
                List.of(List.of(0.0, 0.0), List.of(3.0, 50.0), List.of(1.0, 20.0))));
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
    }

    private static ScoringConfig copyWith(Map<IndicatorId, IndicatorConfig> ind, Map<Profile, ProfileConfig> prof) {
        return new ScoringConfig(base.unit(), base.months(), base.cashProductTypes(), base.semiLiquidTypes(),
                base.bookedStatusValues(), base.runwayCapMonths(), base.trajectory(), base.flowClasses(),
                base.defaultFlowClass(), base.otherSignFallback(), ind, prof, base.regimes(), base.bands(),
                base.limitEngine(), base.insurer(), base.debtDscr(), base.dataRules());
    }
}
