package com.xray.alerting;

import com.xray.domain.model.DynamicsPoint;
import com.xray.domain.model.EntityKey;
import com.xray.domain.model.EntityPanel;
import com.xray.domain.model.IndicatorId;
import com.xray.domain.model.LimitDecision;
import com.xray.domain.model.Profile;
import com.xray.domain.model.ProfileScore;
import com.xray.domain.model.RawIndicator;
import com.xray.domain.model.SignalId;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Read-only window over one panel at month m for one profile (ARCHITECTURE §8.2).
 * Reading a month after m throws: this is what keeps every rule causal. A month before 0 reads as null.
 */
public final class EntityMonthView {

    private final EntityPanel panel;
    private final Profile profile;
    private final int m;
    private final boolean limitProfile;

    public EntityMonthView(EntityPanel panel, Profile profile, int m, boolean limitProfile) {
        this.panel = panel;
        this.profile = profile;
        this.m = m;
        this.limitProfile = limitProfile;
    }

    public int m() {
        return m;
    }

    public Profile profile() {
        return profile;
    }

    public EntityKey key() {
        return panel.key();
    }

    /** Raw value when available, else null. */
    public Double value(IndicatorId id, int k) {
        if (!inRange(k)) return null;
        RawIndicator r = panel.raw(id, k);
        return r.available() ? r.value() : null;
    }

    public ProfileScore score(int k) {
        if (!inRange(k)) return null;
        ProfileScore[] s = panel.profileScores(profile);
        return s == null ? null : s[k];
    }

    public Double finalScore(int k) {
        ProfileScore s = score(k);
        return s == null ? null : s.finalScore();
    }

    public DynamicsPoint dynamics(int k) {
        if (!inRange(k)) return null;
        DynamicsPoint[] d = panel.dynamics(profile);
        return d == null ? null : d[k];
    }

    /** Only in the limit profile (overview F11). */
    public LimitDecision limit(int k) {
        if (!inRange(k) || !limitProfile || panel.limits() == null) return null;
        return panel.limits()[k];
    }

    public Double signal(SignalId id, int k) {
        return inRange(k) ? panel.signal(id, k) : null;
    }

    /** Median of the available values of id over months m − months .. m − 1 (m excluded); null below minPoints. */
    public Double baselineMedian(IndicatorId id, int months, int minPoints) {
        List<Double> v = new ArrayList<>();
        for (int k = Math.max(0, m - months); k < m; k++) {
            Double x = value(id, k);
            if (x != null) v.add(x);
        }
        if (v.size() < minPoints) return null;
        Collections.sort(v);
        int n = v.size();
        return n % 2 == 1 ? v.get(n / 2) : (v.get(n / 2 - 1) + v.get(n / 2)) / 2;
    }

    private boolean inRange(int k) {
        if (k > m) {
            throw new IllegalArgumentException("look-ahead: rule read month " + k + " at month " + m);
        }
        return k >= 0;
    }
}
