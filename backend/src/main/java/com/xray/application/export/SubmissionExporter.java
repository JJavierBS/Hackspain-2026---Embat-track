package com.xray.application.export;

import com.xray.domain.model.Profile;

/**
 * One implementation per submission format (SPEC §11, decision E10). The hidden test arrives on Sunday in the
 * same CSV format as data/raw/. Add an implementation for its scoring unit and ID format, then submit once.
 */
public interface SubmissionExporter {
    /** The value of ?format=. */
    String format();

    /** The whole CSV, header included. */
    String csv(Profile profile);
}
