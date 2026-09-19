package com.xray.pipeline.stages;

import com.xray.config.XRayProperties;

import java.nio.file.Files;

/** The data stages skip when the Embat CSVs are absent, so the app still boots (overview contract item 7). */
final class RawData {

    private RawData() {
    }

    static boolean present(XRayProperties props) {
        return Files.isRegularFile(props.rawPath().resolve("transactions.csv"));
    }
}
